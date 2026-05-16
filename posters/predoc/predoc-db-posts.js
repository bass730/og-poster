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
    db = client.db("predoc");

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
    let predocPostedCollection = await db.collection("predoc-posted-scholarships");
    let predoc_Collection = db.collection("predoc-scholarships");

    // Create indexes in parallel for better performance
    await Promise.all([
        predocPostedCollection.createIndex({ body: 1 }, { background: true }),
        predocPostedCollection.createIndex({ deadline: 1 }, { background: true }),
        predocPostedCollection.createIndex({ app_link: 1 }, { unique: true, background: true }),
        predoc_Collection.createIndex({ body: 1 }, { background: true }),
        predoc_Collection.createIndex({ deadline: 1 }, { background: true }),
        predoc_Collection.createIndex({ app_link: 1 }, { unique: true, background: true }),
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
async function removeOldDocumentsFromDb() {
  try {
    const collection = db.collection("predoc-scholarships");
    const currentDate = new Date();
    const currentDateUTC = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()));
    const batchSize = 1000;
    let totalDeleted = 0;

    // Get all documents for processing
    const cursor = collection.find({}, {
      projection: { _id: 1, deadline: 1, insertionDate: 1 },
      batchSize: batchSize
    });

    let idsToDelete = [];

    for await (const doc of cursor) {
      let shouldDelete = false;

      if (!doc.deadline) continue;

      // Check if deadline is Rolling (case insensitive)
      const isRolling = doc.deadline.toLowerCase() === 'rolling';

      if (isRolling) {
        // For rolling deadlines: delete at the end of the insertion year
        if (doc.insertionDate) {
          // Parse insertion date format: "Wednesday 6th May, 2026"
          const year = extractYearFromInsertionDate(doc.insertionDate);

          if (year) {
            // Create date for end of the year (December 31st, 23:59:59 UTC)
            const endOfYear = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));

            // Delete if current date is past the end of insertion year
            if (currentDateUTC > endOfYear) {
              shouldDelete = true;
            }
          }
        }
      } else {
        // For regular deadlines: parse DD/MM/YYYY format
        const deadlineDate = parseDeadlineDate(doc.deadline);

        if (deadlineDate) {
          // Create UTC date for comparison (midnight)
          const deadlineUTC = Date.UTC(deadlineDate.getFullYear(), deadlineDate.getMonth(), deadlineDate.getDate());

          // Delete if deadline is in the past (strictly before today)
          if (deadlineUTC < currentDateUTC) {
            shouldDelete = true;
          }
        }
      }

      if (shouldDelete) {
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
    throw error;
  }
}

/**
 * Extracts the year from insertion date format: "Wednesday 6th May, 2026"
 * @param {string} insertionDate - The insertion date string
 * @returns {number|null} The extracted year or null if parsing fails
 */
function extractYearFromInsertionDate(insertionDate) {
  if (!insertionDate || typeof insertionDate !== 'string') return null;

  // Match the year at the end of the string (4 digits)
  const yearMatch = insertionDate.match(/(\d{4})$/);
  if (yearMatch) {
    return parseInt(yearMatch[1]);
  }

  return null;
}

/**
 * Parses deadline date from format: "18/05/2026" (DD/MM/YYYY)
 * @param {string} deadlineString - The deadline string (just the date or "Rolling")
 * @returns {Date|null} Parsed date or null if parsing fails
 */
function parseDeadlineDate(deadlineString) {
  if (!deadlineString || typeof deadlineString !== 'string') return null;

  // Match DD/MM/YYYY format
  const datePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const match = deadlineString.match(datePattern);

  if (match) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]) - 1; // Months are 0-indexed
    const year = parseInt(match[3]);

    const date = new Date(Date.UTC(year, month, day));

    // Validate the date is reasonable
    if (!isNaN(date.getTime()) &&
        day >= 1 && day <= 31 &&
        month >= 0 && month <= 11 &&
        year >= 2000 && year <= 2100) {
      return date;
    }
  }

  return null;
};

/**
 * Deletes all documents from the 'Posted-Jobs' collection if count exceeds threshold.
 * Uses efficient counting and bulk operations.
 */
async function deleteIfPostedPredocCollectionHasReachedCountThreshold() {

  try {
    const collection = db.collection("predoc-posted-scholarships");

    // Use estimatedDocumentCount for better performance on large collections
    const count = await collection.estimatedDocumentCount();

    if (count >= 3000) {
      console.log(`🗑️ predoc-posted-scholarships collection has ~${count} documents. Deleting...`);

      const result = await collection.deleteMany({}, {
        writeConcern: { w: 1, j: false }
      });

      console.log(`✅ Deleted ${result.deletedCount} documents from predoc-posted-scholarships.`);
      return;
    } else {
      console.log(`ℹ️ predoc-posted-scholarships has ~${count} documents. No deletion needed.`);
      return;
    }

  } catch (error) {
    console.error("⛔ Error managing Posted-Jobs collection:", error.message);
    process.exit(1);
  }
}

async function deleteAllPostedJobsFromDbNow() {

  try {

    let postedPredoc_Collection = await db.collection("predoc-posted-scholarships");

      let result = await postedPredoc_Collection.deleteMany({}, {
        writeConcern: { w: 1, j: false }
      });

    console.log(`✅ Deleted all documents from posted-jobs-ac-scholarships..`);
    jobsCollection = null; result = null;
    return;

  } catch (error) {
    console.error("⛔ Error managing Posted-tg-Jobs collection:", error.message);
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
    const collection = db.collection("predoc-scholarships");

    // Optimized pipeline with better memory usage
    const pipeline = [
      // Use $lookup with pipeline for better performance
      {
        $lookup: {
          from: "predoc-posted-scholarships",
          let: { linkVariable: "$app_link" },
          pipeline: [
            { $match: { $expr: { $eq: ["$app_link", "$$linkVariable"] } } },
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

/**
 * Adds a document to the 'Posted-Jobs' collection with optimized insertion.
 * Creates collection and indexes if they don't exist.
 * @param {object} jobDocument - The job document that was posted.
 */
async function addDocumentToPostedDb(postDocument) {

  try {
    const collection = db.collection("predoc-posted-scholarships");

    // Create index if collection is new
    const collections = await db.listCollections({ name: "predoc-posted-scholarships" }).toArray();
    if (collections.length === 0) {
      console.log("📊 Creating new Posted-Jobs collection with indexes...");
      await collection.createIndex(
        { app_link: 1 },
        {
          name: "posted_link_index",
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

/**
 * Deletes a scholarship document from both collections by app_link
 * @param {string} appLink - The application link of the scholarship to delete
 * @returns {Promise<{success: boolean, deletedFromPredoc: number, deletedFromPosted: number}>}
 */
async function deleteScholarshipByAppLink(appLink) {
  try {
    if (!appLink) {
      console.error("❌ Invalid appLink provided");
      return { success: false, deletedFromPredoc: 0, deletedFromPosted: 0 };
    }

    const predocCollection = db.collection("predoc-scholarships");
    const postedCollection = db.collection("predoc-posted-scholarships");

    // Delete from both collections by app_link
    const [predocResult, postedResult] = await Promise.all([
      predocCollection.deleteOne(
        { app_link: appLink },
        { writeConcern: { w: 1, j: false } }
      ),
      postedCollection.deleteOne(
        { app_link: appLink },
        { writeConcern: { w: 1, j: false } }
      )
    ]);

    console.log(`✅ Deleted from predoc-scholarships: ${predocResult.deletedCount} document(s)`);
    console.log(`✅ Deleted from predoc-posted-scholarships: ${postedResult.deletedCount} document(s)`);

    return {
      success: predocResult.deletedCount > 0 || postedResult.deletedCount > 0,
      deletedFromPredoc: predocResult.deletedCount,
      deletedFromPosted: postedResult.deletedCount
    };

  } catch (error) {
    console.error("⛔ Error deleting scholarship by appLink:", error.message);
    return { success: false, deletedFromPredoc: 0, deletedFromPosted: 0 };
  }
};

module.exports = {
  initializeDatabase,
  closeDatabase,
  removeOldDocumentsFromDb,
  deleteIfPostedPredocCollectionHasReachedCountThreshold,
  deleteAllPostedJobsFromDbNow,
  findRandomUnpostedDocument,
  addDocumentToPostedDb,
  deleteScholarshipByAppLink
};