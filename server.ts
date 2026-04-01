import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase config
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.error('Error loading firebase-applet-config.json:', e);
}

// Initialize Firebase Admin
let db: any;
try {
  if (getApps().length === 0) {
    if (firebaseConfig.projectId) {
      initializeApp({
        projectId: firebaseConfig.projectId,
      });
      console.log('Firebase Admin initialized with project ID:', firebaseConfig.projectId);
    } else {
      console.warn('Firebase Admin: No projectId found in config, attempting default initialization.');
      initializeApp();
    }
  }
  db = getFirestore(firebaseConfig.firestoreDatabaseId ? firebaseConfig.firestoreDatabaseId : undefined);
} catch (e) {
  console.error('Firebase Admin initialization failed:', e);
}

const NOWPAYMENTS_API_URL = 'https://api.nowpayments.io/v1';

async function startServer() {
  try {
    const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
    const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
    const APP_URL = process.env.APP_URL;

    console.log('Server starting with NOWPAYMENTS_API_KEY:', NOWPAYMENTS_API_KEY ? 'Present' : 'Missing');
    console.log('Server starting with NOWPAYMENTS_IPN_SECRET:', NOWPAYMENTS_IPN_SECRET ? 'Present' : 'Missing');
    console.log('Server starting with APP_URL:', APP_URL);

    if (!db) {
      console.error('Firestore DB not initialized, server may not function correctly.');
    }
    const app = express();
    const PORT = 3000;

    // Webhook for NOWPayments (IPN)
    app.post('/api/nowpayments/webhook', bodyParser.json(), async (req, res) => {
      try {
        const ipn_signature = req.headers['x-nowpayments-sig'];
        const payload = req.body;
        const current_ipn_secret = process.env.NOWPAYMENTS_IPN_SECRET || NOWPAYMENTS_IPN_SECRET;

        if (!current_ipn_secret) {
          console.error('NOWPAYMENTS_IPN_SECRET is not set');
          return res.status(500).send('Server configuration error');
        }

        // Verify signature
        const hmac = crypto.createHmac('sha512', current_ipn_secret);
        hmac.update(JSON.stringify(payload, Object.keys(payload).sort()));
        const signature = hmac.digest('hex');

        if (signature !== ipn_signature) {
          console.error('Invalid NOWPayments signature. Expected:', signature, 'Got:', ipn_signature);
          return res.status(400).send('Invalid signature');
        }

        const { payment_status, order_id } = payload;

        if (payment_status === 'finished' && order_id) {
          console.log(`Payment finished for user: ${order_id}`);
          await db.collection('users').doc(order_id).update({
            isPlus: true
          });
        }

        res.json({ ok: true });
      } catch (webhookError) {
        console.error('Webhook processing error:', webhookError);
        res.status(500).send('Internal server error');
      }
    });

    app.use(bodyParser.json());

    // Create Payment Route (Invoice)
    app.post('/api/nowpayments/create-payment', async (req, res) => {
      const { userId } = req.body;
      const current_api_key = process.env.NOWPAYMENTS_API_KEY || NOWPAYMENTS_API_KEY;
      const current_app_url = process.env.APP_URL || APP_URL || `${req.protocol}://${req.get('host')}`;

      if (!current_api_key) {
        console.error('NOWPAYMENTS_API_KEY is missing');
        return res.status(500).json({ error: 'Brak klucza API NOWPayments w konfiguracji serwera.' });
      }

      try {
        console.log('Creating payment for user:', userId, 'using APP_URL:', current_app_url);
        // Use /invoice endpoint for a hosted payment page redirect
        const response = await fetch(`${NOWPAYMENTS_API_URL}/invoice`, {
          method: 'POST',
          headers: {
            'x-api-key': current_api_key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            price_amount: 5,
            price_currency: 'eur',
            order_id: userId,
            order_description: 'wowAI Plus Subscription',
            ipn_callback_url: `${current_app_url}/api/nowpayments/webhook`,
            success_url: `${current_app_url}?payment=success`,
            cancel_url: `${current_app_url}?payment=cancel`,
          }),
        });

        const data = await response.json() as any;
        
        if (data.invoice_url) {
          console.log('Payment invoice created:', data.invoice_url);
          res.json({ url: data.invoice_url });
        } else {
          console.error('NOWPayments API error response:', JSON.stringify(data, null, 2));
          res.status(400).json({ 
            error: data.message || 'Nie udało się utworzyć faktury płatniczej.',
            details: data
          });
        }
      } catch (error: any) {
        console.error('NOWPayments error:', error);
        res.status(500).json({ error: 'Błąd połączenia z bramką płatniczą: ' + error.message });
      }
    });

    // Vite middleware for development
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
