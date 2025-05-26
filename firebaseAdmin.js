const admin = require("firebase-admin");
const serviceAccount = require("./service_Account.json"); // Replace with your actual file path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
