import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// One-time/admin-only seed script. Run locally or in secure CI only.
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl) {
  throw new Error("Missing SUPABASE_URL. Set it before running this script.");
}

if (!serviceRoleKey) {
  throw new Error(
    "Missing SUPABASE_SERVICE_ROLE_KEY. Set it before running this script."
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const internalUsers = [
  {
    email: "Ariwang@portal.local",
    password: "Boss123!",
    displayName: "Ari Wang",
    role: "internal",
  },
  {
    email: "DrThu_Internal@portal.local",
    password: "Internal123!",
    displayName: "Dr. Thu",
    role: "clinician",
  },
  {
    email: "itjason_day@portal.local",
    password: "It123!",
    displayName: "Jason",
    role: "it",
  },
  {
    email: "Kevin_Internal@portal.local",
    password: "Internal123!",
    displayName: "Kevin",
    role: "internal",
  },
  {
    email: "it_michael@portal.local",
    password: "It123!",
    displayName: "Michael Ly",
    role: "it",
  },
  {
    email: "it_mona@portal.local",
    password: "It123!",
    displayName: "Mona Weng",
    role: "it",
  },
  {
    email: "shirley_internal@portal.local",
    password: "Internal123!",
    displayName: "Shirley Li",
    role: "internal",
  },
  {
    email: "bingchen.li@wanpanel.ai",
    password: "bc123",
    displayName: "Bingchen Li",
    role: "admin",
  },
];

const normalizeEmail = (email) => email.trim().toLowerCase();

async function findUserByEmail(email) {
  const targetEmail = normalizeEmail(email);
  const perPage = 200;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Unable to list auth users: ${error.message}`);
    }

    const users = data.users ?? [];
    const match = users.find(
      (user) => normalizeEmail(user.email ?? "") === targetEmail
    );

    if (match) {
      return match;
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function createOrUpdateInternalUser(userSeed) {
  const email = normalizeEmail(userSeed.email);
  const userMetadata = { display_name: userSeed.displayName };
  const existingUser = await findUserByEmail(email);
  let authUser;
  let action;

  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(
      existingUser.id,
      {
        email,
        password: userSeed.password,
        email_confirm: true,
        user_metadata: userMetadata,
      }
    );

    if (error) {
      throw new Error(`Failed updating auth user ${email}: ${error.message}`);
    }

    authUser = data.user;
    action = "updated";
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: userSeed.password,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    if (error) {
      throw new Error(`Failed creating auth user ${email}: ${error.message}`);
    }

    authUser = data.user;
    action = "created";
  }

  if (!authUser?.id) {
    throw new Error(`No auth user id returned for ${email}.`);
  }

  const { error: profileError } = await supabase
    .from("internal_profiles")
    .upsert(
      {
        id: authUser.id,
        email,
        display_name: userSeed.displayName,
        role: userSeed.role,
        is_active: true,
      },
      { onConflict: "id" }
    );

  if (profileError) {
    throw new Error(`Failed upserting profile ${email}: ${profileError.message}`);
  }

  return { email, action };
}

async function main() {
  const results = [];

  for (const userSeed of internalUsers) {
    const result = await createOrUpdateInternalUser(userSeed);
    results.push(result);
  }

  console.log("Internal user seed complete:");
  for (const result of results) {
    console.log(`- ${result.email}: ${result.action}`);
  }
}

main().catch((error) => {
  console.error("Failed to seed internal users:", error.message);
  process.exit(1);
});
