// functions/index.js - COMPLETE CORRECTED VERSION
const {onCall, onRequest} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {logger} = require("firebase-functions");
const Razorpay = require("razorpay");

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

/**
 * MAIN: Create Razorpay Order - FIXED VERSION
 */
exports.createRazorpayOrder = onCall(
    {
      region: "asia-south1",
      timeoutSeconds: 60,
      memory: "256MiB",
      enforceAppCheck: false,  // FIXED: Bypass App Check
    },
    async (request) => {
      const startTime = Date.now();
      let stepNumber = 0;

      try {
        const {data, auth} = request;

        stepNumber = 1;
        logger.info(`🔄 Step ${stepNumber}: Function called`, {
          amount: data?.amount,
          currency: data?.currency,
          userId: auth?.uid,
        });

        // Security Check
        stepNumber = 2;
        if (!auth) {
          logger.error(`❌ Step ${stepNumber}: Unauthenticated request`);
          throw new Error("Authentication required");
        }

        // Input Validation
        stepNumber = 3;
        const {amount, currency} = data;

        if (!amount || typeof amount !== "number" || amount <= 0) {
          logger.error(`❌ Step ${stepNumber}: Invalid amount:`, amount);
          throw new Error("Valid positive amount required");
        }

        if (!currency || currency !== "INR") {
          logger.error(`❌ Step ${stepNumber}: Invalid currency:`, currency);
          throw new Error("Currency must be INR");
        }

        // Fetch Razorpay Configuration
        stepNumber = 4;
        logger.info(`🔄 Step ${stepNumber}: Fetching Razorpay configuration...`);

        const configDoc = await db.collection("app_config").doc("razorpay").get();

        if (!configDoc.exists) {
          logger.error(`❌ Step ${stepNumber}: Razorpay config not found`);
          throw new Error("Payment configuration not found");
        }

        const config = configDoc.data();
        const keyId = config.key_id;
        const keySecret = config.key_secret;

        if (!keyId || !keySecret) {
          logger.error(`❌ Step ${stepNumber}: Missing Razorpay keys`);
          throw new Error("Payment configuration incomplete");
        }

        // Initialize Razorpay
        stepNumber = 5;
        logger.info(`🔄 Step ${stepNumber}: Initializing Razorpay...`);

        const razorpay = new Razorpay({
          key_id: keyId,
          key_secret: keySecret,
        });

        // Create Razorpay Order
        stepNumber = 6;
        const amountInPaise = Math.round(amount * 100);

        // FIXED: Shortened receipt to under 40 characters
        const receipt = `rcpt_${Date.now()}`;

        const orderOptions = {
          amount: amountInPaise,
          currency: currency,
          receipt: receipt,
          notes: {
            user_id: auth.uid,
            created_at: new Date().toISOString(),
          },
        };

        logger.info(`🔄 Step ${stepNumber}: Creating Razorpay order...`, {
          amount: amountInPaise,
          receipt: receipt,
          receiptLength: receipt.length  // Log receipt length for debugging
        });

        const order = await razorpay.orders.create(orderOptions);

        logger.info(`✅ Step ${stepNumber}: Order created successfully:`, {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
        });

        // Log to Firestore
        stepNumber = 7;
        await db.collection("payment_orders").add({
          orderId: order.id,
          userId: auth.uid,
          amount: amountInPaise,
          currency: currency,
          status: "created",
          createdAt: new Date(),
          razorpayResponse: order,
        });

        // Return Success Response
        const response = {
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          receipt: order.receipt,
          status: "created",
        };

        const executionTime = Date.now() - startTime;
        logger.info(`🎉 Function completed successfully in ${executionTime}ms`);

        return response;

      } catch (error) {
        const executionTime = Date.now() - startTime;
        logger.error(`💥 Function failed at step ${stepNumber} after ${executionTime}ms:`, {
          error: error.message,
          stack: error.stack,
          step: stepNumber,
          userId: request.auth?.uid,
          razorpayError: error.error || null
        });

        // Return more detailed error message
        const errorMessage = error.error ?
          `Razorpay Error: ${error.error.description}` :
          `Payment failed at step ${stepNumber}: ${error.message}`;

        throw new Error(errorMessage);
      }
    },
);

/**
 * Health Check Function - FIXED VERSION
 */
exports.healthCheck = onCall(
    {
      region: "asia-south1",
      timeoutSeconds: 60,
      memory: "128MiB",
      enforceAppCheck: false,  // FIXED: Bypass App Check
    },
    async (request) => {
      try {
        const testDoc = await db.collection("app_config").doc("razorpay").get();

        return {
          status: "healthy",
          timestamp: new Date().toISOString(),
          version: "2.0.2",
          region: "asia-south1",
          firestore: testDoc.exists ? "connected" : "config_missing",
          razorpayConfig: testDoc.exists ? "available" : "missing"
        };
      } catch (error) {
        logger.error("Health check failed:", error);
        throw new Error(`Health check failed: ${error.message}`);
      }
    },
);

/**
 * Test Razorpay Connection - FIXED VERSION
 */
exports.testRazorpay = onCall(
    {
      region: "asia-south1",
      timeoutSeconds: 60,
      memory: "128MiB",
      enforceAppCheck: false,  // FIXED: Bypass App Check
    },
    async (request) => {
      try {
        const {auth} = request;

        if (!auth) {
          throw new Error("Authentication required");
        }

        // Get config
        const configDoc = await db.collection("app_config").doc("razorpay").get();
        if (!configDoc.exists) {
          throw new Error("Razorpay config not found");
        }

        const config = configDoc.data();
        const {key_id, key_secret, environment} = config;

        if (!key_id || !key_secret) {
          throw new Error("Razorpay keys missing");
        }

        // Test Razorpay initialization
        const razorpay = new Razorpay({
          key_id,
          key_secret,
        });

        // FIXED: Shortened receipt to under 40 characters
        const testReceipt = `test_${Date.now()}`;

        // Create a test order
        const testOrder = await razorpay.orders.create({
          amount: 100, // ₹1 in paise
          currency: "INR",
          receipt: testReceipt,
          notes: {
            test: "connection_test",
            user_id: auth.uid,
          },
        });

        return {
          success: true,
          message: "Razorpay connection successful",
          testOrderId: testOrder.id,
          razorpayStatus: testOrder.status,
          environment: environment || 'test',
          receiptUsed: testReceipt,
          receiptLength: testReceipt.length
        };

      } catch (error) {
        logger.error("Razorpay test failed:", error);
        return {
          success: false,
          error: error.message,
          details: error.error || null,
          razorpayError: error.error ? {
            code: error.error.code,
            description: error.error.description,
            field: error.error.field,
            source: error.error.source,
            reason: error.error.reason
          } : null
        };
      }
    },
);

/**
 * Simple HTTP Test (bypasses App Check) - FIXED VERSION
 */
exports.testPaymentSetup = onRequest(
    {
      region: "asia-south1",
      timeoutSeconds: 30,
      memory: "128MiB",
      cors: true,
      enforceAppCheck: false,
    },
    async (req, res) => {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST');
      res.set('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }

      try {
        const configDoc = await db.collection("app_config").doc("razorpay").get();

        if (!configDoc.exists) {
          res.status(404).json({ error: "Razorpay config not found" });
          return;
        }

        const config = configDoc.data();

        res.json({
          success: true,
          timestamp: new Date().toISOString(),
          config: {
            hasKeyId: !!config.key_id,
            hasKeySecret: !!config.key_secret,
            environment: config.environment || 'not_specified',
            keyIdPrefix: config.key_id ? config.key_id.substring(0, 12) + '...' : 'none'
          }
        });

      } catch (error) {
        res.status(500).json({
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    },
);