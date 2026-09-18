# User management live verification — 2026-09-18

## Scope and result

- Verified the Admin user page at desktop and 375 px mobile widths. Admin could list users, edit a TEST user's name and role, disable and reenable the account, and was prevented from disabling or demoting its own account.
- Verified Admin, Staff, and Kitchen Staff dashboard and user API access with isolated TEST accounts. An existing Staff session lost profile/order reads, privileged RPC access, and dashboard access immediately after deactivation. A new login was blocked. Login worked again after reactivation.
- Public QR remained accessible without login. Public sign-up was disabled in the linked Supabase project: `/auth/v1/settings` returned `disable_signup=true`, and a TEST sign-up request was rejected with HTTP 422.
- The two account migrations (`20260918100000` and `20260918101000`) were already recorded as applied in remote migration history. They were not rerun during this verification.

## Email limitation

Reset Password and Invite requests for isolated `example.invalid` TEST addresses returned HTTP 429 (`over_email_send_rate_limit`) from Supabase Auth in both live runs. The application now propagates HTTP 429 with a clear rate-limit message instead of reporting a generic failure. Successful email delivery and the success paths for Invite and Reset Password remain unverified on the hosted project. They require a designated test inbox and an available email provider or Send Email hook. Do not send more test email requests until those are available.

## Performance

Measured in headless Edge against a local production build connected to the linked Supabase project. Each number covers opening Login, signing in, and waiting for the role's dashboard navigation to render. These are two single samples per role, not a benchmark distribution.

| Role | First run | Confirmation run |
| --- | ---: | ---: |
| Admin | 2,533 ms | 1,822 ms |
| Staff | 1,178 ms | 1,309 ms |
| Kitchen Staff | 1,107 ms | 1,398 ms |

## Cleanup and final checks

- Deleted only the registered TEST Auth users from each live run. For both runs, SHA-256 fingerprints of 20 public tables matched before and after cleanup. A separate read-only verification found no TEST catalog, table, profile, or Auth users left behind.
- Local automated tests: 77 passed. Production build and TypeScript passed. ESLint had zero errors and two pre-existing `no-img-element` warnings in customer menu and QR components.
- Test evidence and screenshots are in the ignored `.test-artifacts/active-accounts-live*` directories. The registry omits passwords after cleanup.
