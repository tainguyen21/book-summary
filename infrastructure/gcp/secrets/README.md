# Production Secrets

Secret Manager is the source of truth for production server secrets. The
deployment workflow reads the latest enabled version and synchronizes it into
the `bookwise-runtime` Kubernetes Secret.

Create the following secrets:

```text
bookwise-app-database-url
bookwise-data-database-url
bookwise-migration-database-url
bookwise-oidc-issuer
bookwise-oidc-audience
bookwise-s3-presigned-url-expiry
```

The database URLs connect through the Cloud SQL Auth Proxy on
`127.0.0.1:5432`:

```text
postgresql://APP_USER:PASSWORD@127.0.0.1:5432/bookwise_next
postgresql+psycopg://DATA_USER:PASSWORD@127.0.0.1:5432/bookwise_next
postgresql://MIGRATION_USER:PASSWORD@127.0.0.1:5432/bookwise_next
```

Create a secret without putting its value on the command line:

```powershell
$value = Read-Host "Secret value" -AsSecureString
$plain = [System.Net.NetworkCredential]::new("", $value).Password
$plain | gcloud secrets create bookwise-app-database-url --data-file=-
$plain = $null
```

For an existing secret:

```powershell
$plain | gcloud secrets versions add bookwise-app-database-url --data-file=-
```

Public Auth0 SPA values are GitHub repository variables because they are
embedded in the browser bundle and are not confidential.
