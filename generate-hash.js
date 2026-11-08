const bcrypt = require("bcryptjs");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question("Enter your new admin password: ", async (password) => {
  if (!password || password.length < 10) {
    console.log("Password must be at least 10 characters.");
    rl.close();
    return;
  }

  const hash = await bcrypt.hash(password, 12);

  console.log("\nYour ADMIN_PASSWORD_HASH:\n");
  console.log(hash);

  rl.close();
});
