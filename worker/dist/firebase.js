import admin from "firebase-admin";
export function getAdminApp(env) {
    if (admin.apps.length)
        return admin.app();
    const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
    return admin.initializeApp({
        credential: admin.credential.cert({
            projectId: env.FIREBASE_PROJECT_ID,
            clientEmail: env.FIREBASE_CLIENT_EMAIL,
            privateKey,
        }),
        storageBucket: env.FIREBASE_STORAGE_BUCKET,
    });
}
export function getFirestore(env) {
    return getAdminApp(env).firestore();
}
export function getStorage(env) {
    return getAdminApp(env).storage();
}
