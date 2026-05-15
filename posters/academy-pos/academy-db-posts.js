const { MongoClient } = require("mongodb");
require("dotenv").config();
// Use environment variable for the database URI for security
const uri = process.env.MONGODB_URI
if (!uri) {
  throw new Error("MONGODB_URI environment variable not set.");
}

let client = new MongoClient(uri, {
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

let db; // This variable will hold the database instance once connected

/**
 * Connects to the MongoDB database. Should be called once at application startup.
 */
async function initializeDatabase() {
  try {
    await client.connect();
    db = client.db("academy-db");

    // Create indexes for better query performance
    await createIndexes();
    console.log("✅ Successfully connected to MongoDB Atlas!");
  } catch (error) {
    console.error("⛔ Error connecting to MongoDB Atlas:", error);
    process.exit(1);
  }
}

/**
 * Creates necessary indexes for optimal query performance
 */
async function createIndexes() {
  try {
    let academyDB_Collection = db.collection("academy-db-scholarships");
    let postedAcademy_Collection = db.collection("posted-academy-db-scholarships");

    // Create indexes in parallel for better performance
    await Promise.all([
        academyDB_Collection.createIndex({ application_deadline: 1 }, { background: true }),
        academyDB_Collection.createIndex({ postLink: 1 }, { unique: true, background: true }),
        postedAcademy_Collection.createIndex({ application_deadline: 1 }, { background: true }),
        postedAcademy_Collection.createIndex({ postLink: 1 }, { unique: true, background: true }),
    ]);

    console.log("✅ Database indexing configuration completed");
    return;
    // For Posted-Jobs, we'll create the index when the collection is first used
    // This is handled in addDocumentToPostedDb function

  } catch (error) {
    console.error("⛔ Error configuring indexes:", error);
    // Non-critical error, don't throw
    console.log("ℹ️ Application will continue without optimal indexes");
  }
}

/**
 * Closes the MongoDB connection. Should be called once during application shutdown.
 */
async function closeDatabase() {
  try {
    await client.close();
    console.log("🔌 MongoDB connection closed.");
  } catch (error) {
    console.error("⛔ Error closing MongoDB connection:", error);
    process.exit(1);
  }
}



/**
 * Native date parsing function to replace moment.js
 * @param {string} dateString - Date in format "MMMM DD, YYYY" (e.g., "January 15, 2024")
 * @returns {Date|null} Parsed date or null if invalid
 */


/**
 * Removes documents from the 'predoc-scholarships' collection based on deadline logic:
 * - Rolling deadlines: Delete at the end of the year they were inserted (December 31st)
 * - Regular deadlines (DD/MM/YYYY): Delete if the deadline date is in the past
 * Memory-optimized with cursor streaming and batch processing.
 */
/**
 * Removes documents from the 'jobs-ac-scholarships' collection where the deadline is in the past.
 * Date format example: "24th July 2026", "21st May 2026", "14th May 2026"
 * Memory-optimized with cursor streaming and batch processing.
 */
/**
 * Removes documents from the 'academy-db-scholarships' collection where the deadline is in the past.
 * Date format: ISO date (YYYY-MM-DD) e.g., "2026-09-19", "2026-05-31"
 * Memory-optimized with cursor streaming and batch processing.
 */
async function removeOldDocumentsFromDb() {
  try {
    const collection = db.collection("academy-db-scholarships");
    const currentDate = new Date();
    const currentDateUTC = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()));
    const batchSize = 1000;
    let totalDeleted = 0;

    // Get all documents for processing
    const cursor = collection.find({}, {
      projection: { _id: 1, application_deadline: 1 },
      batchSize: batchSize
    });

    let idsToDelete = [];

    for await (const doc of cursor) {
      if (!doc.application_deadline) continue;

      // Parse deadline date from ISO format (YYYY-MM-DD)
      const deadlineDate = parseDeadlineDate(doc.application_deadline);

      if (deadlineDate) {
        // Create UTC date for comparison (midnight)
        const deadlineUTC = Date.UTC(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());

        // Delete if deadline is in the past (strictly before today)
        if (deadlineUTC < currentDateUTC) {
          idsToDelete.push(doc._id);

          if (idsToDelete.length >= batchSize) {
            const result = await collection.deleteMany(
              { _id: { $in: idsToDelete } },
              { writeConcern: { w: 1, j: false } }
            );
            totalDeleted += result.deletedCount;
            console.log(`🗑️ Deleted batch of ${result.deletedCount} expired documents`);
            idsToDelete = [];
          }
        }
      }
    };

    // Process remaining documents
    if (idsToDelete.length > 0) {
      const result = await collection.deleteMany(
        { _id: { $in: idsToDelete } },
        { writeConcern: { w: 1, j: false } }
      );
      totalDeleted += result.deletedCount;
      console.log(`🗑️ Deleted final batch of ${result.deletedCount} expired documents`);
    }

    if (totalDeleted > 0) {
      console.log(`✅ Successfully deleted ${totalDeleted} expired job documents.`);
    } else {
      console.log("ℹ️ No expired documents found to delete.");
    }

    return totalDeleted;
  } catch (error) {
    console.error("⛔ Error removing expired documents:", error);
    return;
  }
};

/**
 * Parses deadline date from ISO format: "YYYY-MM-DD" (e.g., "2026-09-19", "2026-05-31")
 * @param {string} deadlineString - The deadline string in ISO format
 * @returns {Date|null} Parsed date or null if parsing fails
 */
function parseDeadlineDate(deadlineString) {
  if (!deadlineString || typeof deadlineString !== 'string') return null;

  // Check if the string matches ISO date format (YYYY-MM-DD)
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDatePattern.test(deadlineString)) {
    console.warn(`⚠️ Invalid date format: ${deadlineString}. Expected YYYY-MM-DD`);
    return null;
  }

  // Parse the ISO date string
  const parsedDate = new Date(deadlineString);

  // Check if date is valid
  if (!isNaN(parsedDate.getTime())) {
    // Create UTC date to avoid timezone issues (midnight UTC)
    const utcDate = new Date(Date.UTC(
      parsedDate.getFullYear(),
      parsedDate.getMonth(),
      parsedDate.getDate()
    ));
    return utcDate;
  }

  console.warn(`⚠️ Could not parse date: ${deadlineString}`);
  return null;
};
/**
 * Deletes all documents from the 'Posted-Jobs' collection if count exceeds threshold.
 * Uses efficient counting and bulk operations.
 */
async function deleteIfPostedAcademyCollectionHasReachedCountThreshold() {

  try {
    const collection = db.collection("academy-db-scholarships");

    // Use estimatedDocumentCount for better performance on large collections
    const count = await collection.estimatedDocumentCount();

    if (count >= 3000) {
      console.log(`🗑️ academy-db-scholarships collection has ~${count} documents. Deleting...`);

      const result = await collection.deleteMany({}, {
        writeConcern: { w: 1, j: false }
      });

      console.log(`✅ Deleted ${result.deletedCount} documents from academy-db-scholarships collection.`);
      return;
    } else {
      console.log(`ℹ️ academy-db-scholarships collection has ~${count} documents. No deletion needed.`);
      return;
    }

  } catch (error) {
    console.error("⛔ Error managing Posted-Jobs collection:", error.message);
    process.exit(1);
  }
}


/**
 * Efficiently finds a single, random document from the 'Jobs' collection
 * that has not yet been posted using aggregation pipeline optimization.
 * @returns {Promise<object|null>} A random unposted document or null if none are found.
 */
async function findRandomUnpostedDocument() {

  try {
    const collection = db.collection("academy-db-scholarships");

    // Optimized pipeline with better memory usage
    const pipeline = [
      // Use $lookup with pipeline for better performance
      {
        $lookup: {
          from: "posted-academy-db-scholarships",
          let: { linkVariable: "$postLink" },
          pipeline: [
            { $match: { $expr: { $eq: ["$postLink", "$$linkVariable"]  } } },
            { $limit: 1 },
            { $project: { _id: 1 } }
          ],
          as: "posted"
        }
      },
      // Filter unposted documents
      { $match: { posted: { $size: 0 } } },
      // Random sample
      { $sample: { size: 1 } },
      // Remove the lookup field to reduce memory
      { $unset: "posted" }
    ];

    const cursor = collection.aggregate(pipeline, {
      allowDiskUse: true,
      maxTimeMS: 30000
    });

    const result = await cursor.next();
    await cursor.close();

    return result;
  } catch (error) {
    console.error("⛔ Error finding unposted document:", error);
    process.exit(1);
  }
};

async function deleteAllPostedJobsFromDbNow() {

  try {

    let postedAc_Collection = await db.collection("posted-academy-db-scholarships");

      let result = await postedAc_Collection.deleteMany({}, {
        writeConcern: { w: 1, j: false }
      });

    console.log(`✅ Deleted all documents from posted-academy-db-scholarships collection..`);
    jobsCollection = null; result = null;
    return;

  } catch (error) {
    console.error("⛔ Error managing posted-academy-db-scholarships collection:", error.message);
    process.exit(1);
  }
}


/**
 * Adds a document to the 'Posted-Jobs' collection with optimized insertion.
 * Creates collection and indexes if they don't exist.
 * @param {object} jobDocument - The job document that was posted.
 */
async function addDocumentToPostedDb(postDocument) {

  try {
    const collection = db.collection("posted-academy-db-scholarships");

    // Create index if collection is new
    const collections = await db.listCollections({ name: "posted-academy-db-scholarships" }).toArray();
    if (collections.length === 0) {
      console.log("📊 Creating new Posted-Jobs collection with indexes...");
      await collection.createIndex(
        { postLink: 1 },
        {
          unique: true,
          background: true
        }
      );
    }

    // Use insertOne with writeConcern for better performance
    const result = await collection.insertOne(postDocument, {
      writeConcern: { w: 1, j: false }
    });

    console.log(`📝 Document added to PostedDb with ID: ${result.insertedId}`);
    return {success: true};
  } catch (error) {
    console.error("⛔ Error adding document to Posted-Jobs:", error);
    process.exit(1);
  }
};

module.exports = {
  initializeDatabase,
  closeDatabase,
  removeOldDocumentsFromDb,
  deleteIfPostedAcademyCollectionHasReachedCountThreshold,
  deleteAllPostedJobsFromDbNow,
  findRandomUnpostedDocument,
  addDocumentToPostedDb
};