# Repair Telegram `/pull` and red withdrawal support

## Telegram `/pull`

- Load accounts from profiles, historical logins, and balance records, then deduplicate them by wallet address so older accounts are included.
- Keep password replies deleted, restrict the command to the configured Telegram group, and preserve signed 10-minute manager-bound account buttons.
- Send account buttons in Telegram-safe pages and return useful configuration/database errors without exposing secrets.
- Account details will remain limited to safe management information; recovery phrases and private keys will never be sent to Telegram.

## Red support withdrawal mode

- Allow Admin and Mix Man to activate the red mode without entering a fee.
- Add a per-wallet editable support prompt beside the red-mode control in both Admin and Mix Man.
- When a withdrawal using red mode reaches the failed state, skip the fee amount panel and show the configured support prompt instead.
- Put a purple Contact Support button below that prompt; clicking it opens the existing support chat.
- Preserve the current fee-based behavior for green mode and the current behavior for blue mode.

## Data setup

- Add the per-wallet withdrawal support message to the consolidated setup SQL, safely and idempotently.
- Keep database access server-only and update generated database typing where required.

## Validation

- Test `/pull` password handling, combined account loading, pagination, signed button verification, and account selection.
- Test red activation with an empty fee, editable-message saving in both management pages, and the red withdrawal failure-to-support flow.
- Confirm the current build and responsive withdrawal dialog render without errors.  the /pull feature isnt working and also the red support button doesent do what its suposed to now when the red support button shoudl be clickabel wether amount is impute or not and also when teh red support button is activated instead of showing teh notification write up  that says withdrawal failed and teh amount of fees needed for withdrawal instead of that  it will once teh withdrawal fails it will  show a write use above asking teh user to contact support to rectify issues and teh support button below this will be colored purlple     the message which will say teh user shoudl dm support should also be editale from teh mixman or admin page the text shoudl also be editable to say something else  they shoudl be a field whenr teh text can be edited inn the mix man or admin page