"""Native Google Cloud Storage used by the data-processing service."""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256

from google.api_core.exceptions import NotFound, PreconditionFailed
from google.cloud import storage

from bookwise_data.infrastructure.storage.object_storage import (
    ArtifactIntegrityError,
    StoredObjectLimitError,
    StoredObjectMetadataError,
    StoredObjectNotFoundError,
)


@dataclass(frozen=True, slots=True)
class GcsObjectStorageConfig:
    """Google Cloud Storage configuration authenticated with ADC."""

    bucket: str
    project: str | None = None


class GcsObjectStorage:
    """Read originals and write normalized artifacts with GCS credentials."""

    def __init__(self, config: GcsObjectStorageConfig) -> None:
        client = storage.Client(project=config.project)
        self._bucket = client.bucket(config.bucket)

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

        blob = self._bucket.blob(object_key)
        try:
            blob.reload()
        except NotFound as error:
            raise StoredObjectNotFoundError(
                "The stored source object is missing."
            ) from error

        if blob.size != expected_size:
            raise StoredObjectMetadataError(
                "The stored source size does not match its durable metadata."
            )
        if blob.size > maximum_size:
            raise StoredObjectLimitError("The stored source exceeds the size limit.")

        content = blob.download_as_bytes()
        if len(content) != expected_size:
            raise StoredObjectMetadataError(
                "The stored source size does not match its durable metadata."
            )
        if len(content) > maximum_size:
            raise StoredObjectLimitError("The stored source exceeds the size limit.")
        return content

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

        blob = self._bucket.blob(object_key)
        blob.metadata = {"sha256": actual_sha256}
        try:
            blob.upload_from_string(
                body,
                content_type=content_type,
                if_generation_match=0,
            )
        except PreconditionFailed:
            self._verify_existing_artifact(blob, expected_sha256)

    @staticmethod
    def _verify_existing_artifact(
        blob: storage.Blob,
        expected_sha256: str,
    ) -> None:
        try:
            blob.reload()
        except NotFound as error:
            raise ArtifactIntegrityError(
                "The existing normalized artifact disappeared during verification."
            ) from error

        metadata = blob.metadata or {}
        if metadata.get("sha256") != expected_sha256:
            raise ArtifactIntegrityError(
                "The existing normalized artifact hash does not match."
            )
