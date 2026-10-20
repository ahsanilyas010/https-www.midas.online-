# Getting started with Zoom in LeadCallient

LeadCallient runs your calling and your meetings through **your own Zoom account**. This guide has the steps for your Zoom admin, then a short test for your agents. It should take about 30–45 minutes.

Menu names in Zoom change from time to time. If a label below doesn't match exactly, use the closest one.

## Before you start
- A Zoom **account Owner or Admin** (a normal user can't do the admin steps).
- A **Zoom Phone** subscription, with a Zoom Phone licence for every person who will make calls.
- The web address of your LeadCallient workspace (we will tell you which one). It must be used exactly as written.
- The email address each agent uses in Zoom.

---

## Part 1 — Zoom admin: licences and numbers (≈10 min)
1. Open **https://zoom.us/signin** and sign in as the Owner/Admin. Then click **My Account** (top right) if you land on the home page.
2. In the left menu open **Phone System Management → Users & Rooms**.
3. For each agent who will call: confirm they have a **Zoom Phone licence** and that **outbound calling** is on.
4. Give each agent a **direct number** or choose their **outbound caller ID**. This is the number customers will see.
5. Check your **calling plan covers the countries you will call** (for example US/Canada only, or international). If a country isn't covered, calls to it will fail.

**You are done when:** every calling agent shows a Zoom Phone licence, a caller ID, and outbound calling enabled.

## Part 2 — Zoom admin: let LeadCallient show the phone (≈10 min)
1. Go to **https://marketplace.zoom.us** and sign in with the same admin account.
2. Search for **Zoom Phone Smart Embed** and click **Install** for your account.
3. Open the installed app, scroll to the **Manage** section, choose **Configure App → Edit**, and **add the web address of your LeadCallient workspace** (for example `https://yourcompany.example.com`). Save.
4. Back in the Zoom web portal, go to **Phone System Management → Company Info → Account Settings** and turn on **Automatically Call From Third Party Apps**.
5. Ask every agent to update the **Zoom desktop app to version 5.9.0 or newer** and sign in to it.

**You are done when:** the app is installed, the address is in its approved list, and the setting is on.

## Part 3 — Zoom admin: meetings (≈15 min)
This lets LeadCallient book Zoom meetings for your agents.
1. In **User Management → Roles**, make sure you have permission to manage **Server-to-Server OAuth apps**.
2. On **https://marketplace.zoom.us** choose **Develop → Build App**, pick **Server-to-Server OAuth App**, and click **Create**. Name it "LeadCallient meetings".
3. On the **App Credentials** page, copy three values: **Account ID**, **Client ID**, **Client Secret**.
4. On the **Information** tab fill in a short description, your company name, and a developer name and email.
5. On the **Scopes** tab click **Add Scopes** and add these five:
   - `meeting:write:meeting:admin`
   - `meeting:read:meeting:admin`
   - `meeting:update:meeting:admin`
   - `meeting:delete:meeting:admin`
   - `user:read:user:admin`
6. Click **Activate**. Wait about **5 minutes** before continuing.
7. Sign in to LeadCallient as your admin, open **Integrations → Connect Zoom**, paste the three values, and click **Save and verify**.

**You are done when:** LeadCallient shows **Connected**. Please don't send the Client Secret by email or chat. Enter it yourself on that page.

## Part 4 — Setting up your people and leads (with us)
1. We create your workspace and your admin login.
2. In LeadCallient open **People** and create each agent using **the same email they use in Zoom**. (Meetings are hosted by that email, so it must match.) Give each person the one-time password shown on screen.
3. Create a **campaign** (country, calling hours, caller ID if you want to override the default), then **add your agents** to it and set it to **active**.
4. Upload a small **test list** of leads on the **Data** page (include your own test number), and have a manager **mark them as screened**.

## Part 5 — Agent test (each agent, ≈10 min)
1. Sign in to LeadCallient and click **Clock in**.
2. Open **Dial workspace**. A **Zoom Phone** panel appears in the corner: **sign in to Zoom there** (once). It should say **Ready**.
3. A lead appears. Click **Call**. The call should ring from Zoom, and you should hear it connect.
4. When it ends, choose an **outcome**, add a note, and click **Save & next**.
5. Open **My leads**, click **Book Zoom meeting** on a lead, pick a time, and save. Check it appears under **Meetings** and in your Zoom calendar.

## Part 6 — Check it worked
- The call appears on the **Live floor** and in **Performance** (with outcome and length).
- The lead's **attempts** went up on **My leads**.
- The call and meeting appear in your **Zoom** history.
- If your Zoom account records calls, a **recording link** appears on the call.

## If something doesn't work
| What you see | Likely cause |
|---|---|
| Phone panel stays on "Starting…" or shows an error about the domain | Part 2 isn't finished (app not installed, address not approved, or setting off) |
| Call button does nothing | The panel isn't signed in or isn't Ready |
| Call fails to connect | The agent has no Zoom Phone licence, or your plan doesn't cover that country |
| "User not found" when booking a meeting | The agent's LeadCallient email isn't a Zoom user |
| Zoom won't verify | Scopes missing, or the app isn't activated yet (wait 5 minutes) |

**When you report a problem, please send:** who you were signed in as, what you clicked, the exact message on screen (or a screenshot), and the time it happened.
