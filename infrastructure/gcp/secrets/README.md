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
postgresql://app_rw:APP_PASSWORD@127.0.0.1:5432/bookwise_next
postgresql+psycopg://data_rw:DATA_PASSWORD@127.0.0.1:5432/bookwise_next
postgresql://migration_admin:MIGRATION_PASSWORD@127.0.0.1:5432/bookwise_next
```

Replace each password placeholder with the password assigned to that Cloud
SQL user. If a password contains URL-reserved characters, percent-encode it.

The Auth0 values are:

```text
bookwise-oidc-issuer=https://dev-p8c5tpe1ghv8qtxf.us.auth0.com/
bookwise-oidc-audience=https://tai-dev-web.cloud
bookwise-s3-presigned-url-expiry=600
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
