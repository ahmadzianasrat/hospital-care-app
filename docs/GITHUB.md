# Putting This Project in GitHub (step by step)

Do this once, after unzipping the file I gave you. It takes about 15 minutes. Everything is free.

Why bother: right now the only copy of this code is the zip file I sent you. GitHub keeps a safe copy online,
gives you a history of every change, and is where Claude Code (if you use it later) and free hosting (like
Vercel) both connect to.

## 1. Create a GitHub account

1. Go to **github.com** and sign up (free). Choose a username, verify your email.

## 2. Install Git on your computer

1. Go to **git-scm.com/downloads**, download the installer for your operating system, run it with the default
   options.
2. Open a terminal (on Windows, use "Git Bash" which the installer just added; on Mac, use Terminal) and check
   it worked:
   ```
   git --version
   ```
   You should see something like `git version 2.x.x`.

## 3. Tell Git who you are (one-time, on this computer)

```
git config --global user.name "Your Name"
git config --global user.email "the-email-you-used-for-github@example.com"
```

## 4. Create the repository on GitHub

1. On github.com, click the **+** in the top right > **New repository**.
2. Name it something like `hospital-care-app`.
3. Choose **Private** (important: this project should not be public yet).
4. Do **not** tick "Add a README" or ".gitignore" — leave everything else unchecked.
5. Click **Create repository**. Keep this page open; the next screen shows some commands, but follow the steps
   below instead, since your folder already has files in it.

## 5. Put the project folder under Git

1. Unzip the file I gave you if you haven't already. You should have a folder called `hospital-care` containing
   `app`, `database`, and `docs` subfolders.
2. Open a terminal **inside that `hospital-care` folder**. In VS Code: File > Open Folder > select `hospital-care`,
   then Terminal > New Terminal.
3. Run:
   ```
   git init
   git add .
   git commit -m "Phase 1: database, app, docs"
   ```
   `git init` starts tracking the folder. `git add .` stages every file. `git commit` saves a snapshot with a
   message describing it.

   Important: `.env` is deliberately **not** included (see `.gitignore` inside `app/`), because it will hold your
   Supabase keys, and keys should never go into GitHub, even a private repo. Never remove `.env` from
   `.gitignore`.

## 6. Connect your folder to the GitHub repository and upload it

GitHub shows you the exact URL for your new repository (something like
`https://github.com/yourname/hospital-care-app.git`). Copy it, then run:

```
git branch -M main
git remote add origin PASTE-THE-URL-HERE
git push -u origin main
```

The first time you push, GitHub will ask you to sign in in a browser window; approve it. Refresh the GitHub page
in your browser afterward: your files should now be there.

## 7. From now on, after I send you updates

Each time I give you new files for the next step (1F, Phase 2, and so on), replace the matching files in your
local `hospital-care` folder, then run:

```
git add .
git commit -m "Describe what changed, e.g. Step 1F: ward board"
git push
```

That uploads the new version. Your history on GitHub keeps every past version, so nothing is ever lost.

## 8. A few habits worth keeping

- **Never commit `.env`** or anything with a real password, API key, or real patient data. If you're ever unsure
  whether something is safe to commit, ask me first.
- **Commit often**, with short messages describing what changed. Little and frequent is better than one giant
  commit.
- If `git push` ever says something about "rejected" or "diverged," stop and send me the exact message rather
  than forcing anything.

## What GitHub does not do (yet)

Having the code in GitHub does not put your app online for the hospital to use, and does not affect Supabase at
all. It is just a safe, versioned copy of the code. Putting the app online for others to open in a browser is a
separate, later step (free hosting such as Vercel or Netlify), which I can walk you through when the app is
ready for that.
