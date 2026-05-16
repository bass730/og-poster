"use strict";

const cron = require("node-cron");
const http = require("http");
const { tg_post_jobs_ac } = require("./posters/jobs-ac/jobs-ac-tg.js");
const { tg_post_predoc } = require("./posters/predoc/predoc-tg.js");
const { tg_post_academy } = require("./posters/academy-pos/academy-tg.js");
const {formatNigerianTime} = require("./utils/dateHelpers.js");

// --- HTTP Server for Health Checks ---
const server = http.createServer((req, res) => {
  if (req.url === '/' && req.method === 'GET') {
    const serverTime = formatNigerianTime();
    const html = `
      <div style="font-family: monospace; line-height: 1.6; font-weight: 400; font-size: 24px;">
        <p>&#9989 [VSPPM] Server is running.</p>
        <p><strong>Server Time (Nigerian):</strong> ${serverTime}</p>
        <p><strong>Daily Schedule for OG-Poster:</strong></p>
        <p></p>
        <p>CXHOW..</strong></p>
      </div>
    `;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// --- Cron Jobs Setup ---


async function setupCronJobs() {
//post by 7pm
let post_schedules = ['0 4 * * *', '50 6 * * *', '15 7 * * *', '32 7 * * *',
   '52 7 * * *', '30 10 * * *', '54 10 * * *', '28 14 * * *', '47 14 * * *', '12 19 * * *', '38 19 * * *', '45 19 * * *'];
//schedule Jobs-ac - 50 6 * * *, 52 7 * * *, 30 10 * * *,  28 14 * * *, 45 19 * * *
//schedule predoc - '32 7 * * *'
  post_schedules.forEach(time => {
    if(time === '0 4 * * *') {
        cron.schedule(time, async () => {
        console.log('refreshing program..');
        process.exit(1);
        }, { timezone: "Africa/Lagos" });
    } else if (time === '50 6 * * *') {
      cron.schedule(time, async () => {
        console.log('executing jobs_ac fn..');
        await tg_post_jobs_ac();
      }, { timezone: "Africa/Lagos" });
    } else if (time === '52 7 * * *') {
      cron.schedule(time, async () => {
        console.log('executing predoc fn..');
        let pr = await tg_post_predoc();
        if(pr==null) {
          console.log('executing academy fn..');
          await tg_post_academy();
        }
      }, { timezone: "Africa/Lagos" });
    } else if (time === '30 10 * * *') {
      cron.schedule(time, async () => {
        console.log('executing jobs_ac fn..');
        await tg_post_jobs_ac();
      }, { timezone: "Africa/Lagos" });
    }  else if (time === '28 14 * * *') {
      cron.schedule(time, async () => {
        console.log('executing jobs_ac fn..');
        await tg_post_jobs_ac();
      }, { timezone: "Africa/Lagos" });
    }  else if (time === '45 19 * * *') {
      cron.schedule(time, async () => {
        console.log('executing jobs_ac fn..');
        await tg_post_jobs_ac();
      }, { timezone: "Africa/Lagos" });
    }  else {
      cron.schedule(time, async () => {
        console.log('executing academy fn..');
        await tg_post_academy();
      }, { timezone: "Africa/Lagos" });
    }

  });

  console.log('📅 Daily posts have been scheduled successfully.');
}



// --- Server Startup and Graceful Shutdown ---
async function startServer() {
  try {

    let PORT = process.env.PORT || 4200;

    server.listen(PORT, async () => {
      try {
        console.log(`🟢 Server is live on port ${PORT}`);
        await setupCronJobs();
      } catch (error) {
        console.error("❌ Error during server startup:", error);
        process.exit(1);
      }
    });

    server.on('error', (error) => {
    console.error('❌ Server error:', error);
        if (error.code === 'EADDRINUSE') {
          console.error(`Port ${PORT} is already in use`);
          process.exit(1);
        }
      });

    // Handle shutdown signals gracefully
    const shutdown = async () => {
      console.log("🔄 Shutting down server...");

      // Stop accepting new connections
      server.close(async (err) => {

        if (err) {
          console.error("❌ Error closing HTTP server:", err);
        } else {
          console.log("✅ HTTP server closed.");
        };

        process.exit(0);

      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        console.log("⚠️ Forcing shutdown...");
        process.exit(1);
      }, 10000);
    };

    process.on('SIGINT', shutdown);  // For local Ctrl+C
    process.on('SIGTERM', shutdown); // For hosting platform stop commands
    process.on('SIGQUIT', shutdown); // For additional graceful shutdown

  } catch (error) {
    console.error("❌ Failed to start the server:", error);
    process.exit(1);
  }
}

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

startServer();