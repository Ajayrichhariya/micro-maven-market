# Private AdBridge Chat & Approval System

## What will change
- Keep the existing AdBridge landing page and move sign-in access to a discreet footer link.
- Keep individual email/password accounts. New signups wait for admin approval; existing users retain access, and the admin can approve, reject, or block accounts.
- Add a private, real-time one-to-one inbox for approved users, with conversation search, unread indicators, message timestamps, and image/video/audio/document attachments.
- Add a clean approval-status page and an authenticated messages page that matches the existing AdBridge design.

## Technical approach
- Add database account status and direct-conversation/message tables with explicit grants and row-level security. Server-side database checks enforce approved status and conversation membership; contact lookup exposes only safe display fields.
- Harden signup role assignment so user-provided metadata cannot create admin accounts. Keep current accounts approved and make new accounts pending by default.
- Add a private chat-media bucket with participant-only access, plus real-time subscriptions and admin approval updates.
- Validate the public landing page, protected routes, admin controls, messaging, and attachment flow in the preview.
