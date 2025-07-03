require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// 🔹 Route: Step 1 - Redirect user to Google login
app.get('/auth', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'openid',
    ],
  });
  res.redirect(authUrl);
});

// 🔹 Route: Step 2 - Handle OAuth2 callback
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.status(400).send('❌ No code in query');
  }

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    console.log('✅ Tokens:', tokens);

    res.send('✅ OAuth Success! You can now call /emails');
  } catch (error) {
    console.error('OAuth Error:', error.response?.data || error.message || error);
    res.status(500).send('❌ OAuth failed. Check console.');
  }
});

// 🔹 Route: Step 3 - Fetch latest 5 emails
app.get('/emails', async (req, res) => {
  try {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const response = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5,
    });

    const messages = response.data.messages || [];
    const emails = [];

    for (let msg of messages) {
      const msgDetail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
      });

      const headers = msgDetail.data.payload.headers;
      const subjectHeader = headers.find(h => h.name === 'Subject');
      const fromHeader = headers.find(h => h.name === 'From');

      const subject = subjectHeader ? subjectHeader.value : '(No Subject)';
      const from = fromHeader ? fromHeader.value : '(Unknown Sender)';

      let body = '';
      const parts = msgDetail.data.payload.parts;

      if (parts) {
        const part = parts.find(p => p.mimeType === 'text/plain');
        if (part?.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString();
        }
      } else if (msgDetail.data.payload.body?.data) {
        body = Buffer.from(msgDetail.data.payload.body.data, 'base64').toString();
      }

      emails.push({ subject, from, body });
    }

    res.json(emails);
  } catch (error) {
    console.error('❌ Error fetching emails:', error);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// 🔹 Default route
app.get('/', (req, res) => {
  res.send('📩 MailWise Backend is Running!');
});

// 🔹 Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
