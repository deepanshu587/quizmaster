import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCrA6wWUzSIEi3aNsLbClEFgPnVcCSJpTQ",
  authDomain: "quizmaster-9c3c8.firebaseapp.com",
  projectId: "quizmaster-9c3c8",
  storageBucket: "quizmaster-9c3c8.firebasestorage.app",
  messagingSenderId: "614633901264",
  appId: "1:614633901264:web:21dec022b6f09483b362d5",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);