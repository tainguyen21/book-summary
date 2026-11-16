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
bookwise-oidc-audience=https://api.bookwise.local
bookwise-s3-presigned-url-expiry=600
```

The audience must exactly match the Auth0 API identifier and the GitHub
`NEXT_PUBLIC_AUTH0_AUDIENCE` variable. It is not the public API URL.

Create a secret without putting its value on the command line. Write the
value to a temporary file rather than piping it: a PowerShell pipe appends a
line break, which ends up inside the database name and makes the migration
Job fail with `database ... does not exist`.

```powershell
$value = Read-Host "Secret value" -AsSecureString
$plain = [System.Net.NetworkCredential]::new("", $value).Password
$file = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($file, $plain, [System.Text.UTF8Encoding]::new($false))
gcloud secrets create bookwise-app-database-url --data-file=$file
Remove-Item -LiteralPath $file -Force
$plain = $null
```

For an existing secret, use the same steps with:

```powershell
gcloud secrets versions add bookwise-app-database-url --data-file=$file
```

Public Auth0 SPA values are GitHub repository variables because they are
embedded in the browser bundle and are not confidential.
