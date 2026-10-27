# Phone notifications for new GUC grades

Ritual stores each device's push endpoint in the existing Lovable Cloud Supabase database, scoped to the signed-in user. Grade push messages contain no grade names or scores; the service worker displays a generic alert and opens the university grades page when tapped.

## Configure Web Push keys

Generate a VAPID key pair once (keep the same pair for future deployments):

```sh
npx web-push generate-vapid-keys
```

In Lovable Cloud, add these server-side environment secrets:

- `GRADE_PUSH_VAPID_PUBLIC_KEY`: the generated public key
- `GRADE_PUSH_VAPID_PRIVATE_KEY`: the generated private key
- `GRADE_PUSH_VAPID_SUBJECT`: `https://habit-buddy-app-47.lovable.app`

Never put the private key in client-side variables or commit it to GitHub. The public key is returned to authenticated Ritual clients only to create their browser push subscription.

## Apply and enable

Apply the migration `supabase/migrations/20261027120000_grade_push_subscriptions.sql` to the connected Lovable Cloud Supabase database. Deploy Ritual after adding the secrets. In Ritual, open the GUC connection area and tap **Enable phone alerts**, then allow notifications.

On iPhone, open Ritual in Safari, use **Share → Add to Home Screen**, open the installed Ritual app, and then enable phone alerts. On Android, use Chrome and allow notifications. The device must have an internet connection for background delivery.
