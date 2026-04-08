const admin = require('firebase-admin');

const firebaseCredentials = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

const isFirebaseConfigured = Object.values(firebaseCredentials).every(Boolean);

if (isFirebaseConfigured && !admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseCredentials),
  });
}

admin.isFirebaseConfigured = isFirebaseConfigured;

module.exports = admin;
