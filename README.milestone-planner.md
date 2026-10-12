# TitikMaju — Firebase setup

The app uses the Firebase Web SDK directly. It does not use the workspace's PostgreSQL database or store project data in browser storage.

## Configure Firebase

1. Create a Firebase project and register a Web app.
2. In **Authentication → Sign-in method**, enable **Anonymous**.
3. Create a **Cloud Firestore** database.
4. Publish the rules in `firestore.rules` in **Firestore → Rules**.
5. Add the four values from your Firebase Web app configuration as environment variables for the app:

   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_APP_ID`

   For local development, copy `.env.example` to `.env.local` and replace the placeholder values. For a published app, configure the same `VITE_` variables in the app's deployment environment before publishing.

The Web app configuration values identify the Firebase project; they are not service-account credentials. Firestore access is restricted by the rules to the signed-in anonymous user's own `users/{uid}` path. Never put a Firebase Admin SDK service-account key in the frontend.

## Data and account behavior

Projects live at `users/{uid}/projects/{projectId}` and milestones are stored in each project's `milestones` subcollection. The app signs visitors in anonymously, so their data is private to that Firebase user and updates in real time. Anonymous accounts are tied to the current browser; clearing browser storage can make an anonymous account inaccessible.
