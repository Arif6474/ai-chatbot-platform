const readline = require('readline');
const { connectDB, disconnectDB } = require('../config/database');
const AdminUser = require('../models/AdminUser');

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      params.email = args[i + 1];
      i++;
    } else if (args[i] === '--password' && args[i + 1]) {
      params.password = args[i + 1];
      i++;
    }
  }
  return params;
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt for a password without echoing characters to the terminal.
 * Falls back to standard prompt in non-TTY environments (e.g., piped input, CI).
 */
function promptPassword(question) {
  // In non-TTY environments (CI, piped stdin), fall back to standard prompt
  if (!process.stdin.isTTY) {
    return prompt(question);
  }

  return new Promise((resolve) => {
    process.stdout.write(question);
    const input = [];

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    function onData(char) {
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input.join('').trim());
      } else if (char === '\u0003') {
        // Ctrl+C
        process.stdout.write('\n');
        process.exit(1);
      } else if (char === '\u007F') {
        // Backspace
        input.pop();
      } else {
        input.push(char);
      }
    }

    process.stdin.on('data', onData);
  });
}

async function createAdmin() {
  console.log('=== AI Chatbot Platform: Admin Account Setup ===\n');

  const args = parseArgs();
  let email = args.email || process.env.ADMIN_EMAIL;
  let password = args.password || process.env.ADMIN_PASSWORD;

  if (!email) {
    email = await prompt('Enter Admin Email: ');
  }

  if (!password) {
    password = await promptPassword('Enter Admin Password (min 8 chars, hidden): ');
  } else if (args.password) {
    // Password was supplied as a --password CLI argument.
    // Security Warning: command-line arguments are visible in process listings
    // (e.g., `ps aux`) and may be preserved in shell history.
    // Prefer interactive entry or the ADMIN_PASSWORD environment variable instead.
    console.warn(
      '[SECURITY WARNING] Password supplied via --password flag.\n' +
      '  CLI arguments are visible in process listings (ps aux) and shell history.\n' +
      '  Prefer interactive entry or the ADMIN_PASSWORD environment variable.\n'
    );
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('[ERROR] A valid email address is required.');
    process.exit(1);
  }

  if (!password || password.length < 8) {
    console.error('[ERROR] Password must be at least 8 characters long.');
    process.exit(1);
  }

  // Connect to database
  const connected = await connectDB();
  if (!connected) {
    console.error('[FATAL] Cannot connect to MongoDB. Admin account was not created.');
    process.exit(1);
  }

  try {
    const normalizedEmail = email.toLowerCase().trim();

    // Check for duplicate
    const existing = await AdminUser.findOne({ email: normalizedEmail });
    if (existing) {
      console.warn(`[WARN] Admin account with email "${normalizedEmail}" already exists. No action taken.`);
      await disconnectDB();
      process.exit(0);
    }

    // Hash password securely with bcrypt salt 12
    const passwordHash = await AdminUser.hashPassword(password);

    const admin = await AdminUser.create({
      email: normalizedEmail,
      passwordHash,
      role: 'admin',
      status: 'active',
    });

    console.log(`\n[SUCCESS] Administrator account successfully created!`);
    console.log(`- ID: ${admin.id}`);
    console.log(`- Email: ${admin.email}`);
    console.log(`- Role: ${admin.role}`);
    console.log(`- Status: ${admin.status}`);
  } catch (error) {
    console.error(`[FATAL] Failed to create administrator account: ${error.message}`);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

if (require.main === module) {
  createAdmin();
}

module.exports = { createAdmin };
