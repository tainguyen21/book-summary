"""Private S3-compatible storage used by the data-processing service."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


class StoredObjectNotFoundError(Exception):
    """A requested private object is definitively absent."""


class StoredObjectLimitError(Exception):
    """A private object exceeds its declared ingestion bounds."""


class StoredObjectMetadataError(Exception):
    """A private object's storage metadata differs from durable metadata."""


class ArtifactIntegrityError(Exception):
    """An immutable artifact key points to unexpected bytes."""


@dataclass(frozen=True, slots=True)
class S3ObjectStorageConfig:
    """Credentials and endpoint settings for a private S3-compatible bucket."""

    region: str
    access_key_id: str
    secret_access_key: str
    bucket: str
    endpoint_url: str | None = None


class S3ObjectStorage:
    """Read originals and write normalized artifacts without public access."""

    def __init__(self, config: S3ObjectStorageConfig) -> None:
        self._config = config
        self._client = boto3.client(
            "s3",
            endpoint_url=config.endpoint_url,
            region_name=config.region,
            aws_access_key_id=config.access_key_id,
            aws_secret_access_key=config.secret_access_key,
            config=Config(
                s3={"addressing_style": "path"} if config.endpoint_url else None
            ),
        )

    def download(
        self,
        object_key: str,
        expected_size: int,
        maximum_size: int,
    ) -> bytes:
        """Read a bounded original object with service credentials."""

        if expected_size < 0:
            raise StoredObjectMetadataError("The stored source size is invalid.")
        if expected_size > maximum_size:
            raise StoredObjectLimitError("The stored source exceeds the size limit.")

        try:
            response = self._client.get_object(
                Bucket=self._config.bucket,
                Key=object_key,
            )
        except ClientError as error:
            if _is_not_found(error):
                raise StoredObjectNotFoundError(
                    "The stored source object is missing."
                ) from error
            raise

        content_length = response.get("ContentLength")
        if not isinstance(content_length, int) or content_length != expected_size:
            response["Body"].close()
            raise StoredObjectMetadataError(
                "The stored source size does not match its durable metadata."
            )
        if content_length > maximum_size:
            response["Body"].close()
            raise StoredObjectLimitError("The stored source exceeds the size limit.")

        body = response["Body"]
        try:
            content = bytearray()
            while chunk := body.read(1024 * 1024):
                content.extend(chunk)
                if len(content) > maximum_size:
                    raise StoredObjectLimitError(
                        "The stored source exceeds the size limit."
                    )
            if len(content) != expected_size:
                raise StoredObjectMetadataError(
                    "The stored source size does not match its durable metadata."
                )
            return bytes(content)
        finally:
            body.close()

    def put_private_immutable(
        self,
        object_key: str,
        body: bytes,
        content_type: str,
        expected_sha256: str,
    ) -> None:
        """Create a content-addressed artifact without granting public access."""

        actual_sha256 = sha256(body).hexdigest()
        if actual_sha256 != expected_sha256:
            raise ArtifactIntegrityError(
                "The normalized artifact does not match its persisted hash."
            )

        try:
            self._client.put_object(
                Bucket=self._config.bucket,
                Key=object_key,
                Body=body,
                ContentType=content_type,
                IfNoneMatch="*",
                Metadata={"sha256": actual_sha256},
            )
        except ClientError as error:
            if not _is_precondition_failed(error):
                raise
            self._verify_existing_artifact(object_key, expected_sha256)

    def _verify_existing_artifact(
        self,
        object_key: str,
        expected_sha256: str,
    ) -> None:
        try:
            response = self._client.head_object(
                Bucket=self._config.bucket,
                Key=object_key,
            )
        except ClientError as error:
            if _is_not_found(error):
                raise ArtifactIntegrityError(
                    "The existing normalized artifact disappeared during verification."
                ) from error
            raise

        metadata = response.get("Metadata", {})
        if metadata.get("sha256") != expected_sha256:
            raise ArtifactIntegrityError(
                "The existing normalized artifact hash does not match."
            )


def _is_not_found(error: ClientError) -> bool:
    response = error.response
    return response.get("Error", {}).get("Code") in {
        "NoSuchKey",
        "NoSuchObject",
        "404",
    } or (response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404)


def _is_precondition_failed(error: ClientError) -> bool:
    response = error.response
    return (
        response.get("Error", {}).get("Code")
        in {
            "PreconditionFailed",
            "412",
        }
        or response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 412
    )
