# TUSHAR APP STORE — Photo Functions Edition

## Run locally
1. Install Node.js 18+.
2. Extract this ZIP and open the folder in VS Code.
3. Run `npm install`
4. Run `npm start`
5. Visit `http://localhost:3000`

## Added photo functions
- Upload a profile photo directly from the Account page.
- Upload an app icon image instead of only using an image URL.
- Upload multiple app screenshots (up to 9) when publishing.
- Instant local previews before upload.
- Screenshot gallery inside App Details.
- Click any screenshot to open a large lightbox view.
- Images are served from the local `uploads/` folder.
- Existing purple + white + chocolate theme is kept; the existing app photos are not replaced.

## Existing features
- Signup/login with bcrypt password hashing and session cookies.
- HTML app upload (3 MB max), approval queue, app categories and search.
- Admin approve/reject/delete controls.
- App details and OPEN app button.
- Ratings/reviews.
- Owner-only app editing/deletion.
- Responsive styling and animations.
- Premium display remains locked; no payment checkout.

## Photo limits
- Images: PNG/JPG/WEBP/GIF, max 2 MB each.
- Up to 10 images per media request; the publish UI uses one icon + up to 9 screenshots.
- HTML upload: max 3 MB.

## Security note
This is a learning/starter project. Uploaded HTML executes as active code. For public deployment, isolate user apps on a separate origin with restrictive sandboxing, add CSRF protection, rate limiting, secure HTTPS cookies, upload scanning, database backups, and a production session store.


## TUSHAR AI visual update
- TUSHAR AI 3D-style logo branding added to the sidebar and mobile header.
- Hero photo area replaced with a TUSHAR AI 3D neon visual.
- App icon and screenshot upload file cards now use 3D file icons.
- Existing backend/API and publishing features are unchanged.


## Inline AI tool chat update
- Selecting any 3-dot tool opens the chat inline on the same page.
- No new browser window/tab is opened.
- The selected tool is shown in the chat header and the message field is focused automatically.
- Messages can be typed and sent directly in the TUSHAR AI chat area.


### Branding
The uploaded TUSHAR.AI logo (58040.png) is included as `public/tushar-ai-logo.png` and used for the app branding.
