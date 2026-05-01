//Mongoose ODM \u2014 wraps the native MongoDB driver and powers every model in this app.
const mongoose = require('mongoose');

//Connect to MongoDB using Mongoose. Called once from server.js at startup.
async function connectDB() {
    try {
        //Open the connection using the URI from the encrypted env file.
        const conn = await mongoose.connect(process.env.MONGO_URI);
        //Log the resolved host so I can confirm which cluster I'm pointed at.
        console.log('Connected to MongoDB at ' + conn.connection.host);
    } catch (error) {
        //Log the failure reason so I can diagnose auth/network issues quickly.
        console.error('Failed to connect to MongoDB:', error.message);
        //Hard exit \u2014 the server is useless without a database connection.
        process.exit(1);
    }
}

//Export the single helper so server.js can call it at boot.
module.exports = connectDB;
