// Runs inside mongosh during first-time container init.
// Environment variables are injected by docker-compose.

const dbName = process.env.MONGO_INITDB_DATABASE || "spec-center";
const appUser = process.env.MONGO_APP_USERNAME || "sc_app";
const appPass = process.env.MONGO_APP_PASSWORD;

const appDb = db.getSiblingDB(dbName);

if (appDb.getUser(appUser) === null) {
  appDb.createUser({
    user: appUser,
    pwd: appPass,
    roles: [{ role: "readWrite", db: dbName }],
  });
  print("Created user '" + appUser + "' on database '" + dbName + "'");
} else {
  print("User '" + appUser + "' already exists, skipping");
}
