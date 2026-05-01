/**
 * User Model
 *
 * Defines the Mongoose schema for admin user accounts in the Papi's Pictures application.
 * Each document represents a user with authentication credentials and account type.
 * This schema is used with the 'users' collection in MongoDB.
 */
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 12;

/**
 * Schema definition for the users collection.
 * Tracks login credentials and account type for admin authentication.
 */
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },  // Login username.
    password: { type: String, required: true },                // Bcrypt hashed password.
    accountType: { type: String, default: 'admin' }            // Account type (e.g., "admin").
}, { timestamps: true });  // Automatically adds createdAt and updatedAt fields.

//Hash the password with bcrypt before saving if it has been modified.
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
});

//Compare a plaintext password against the stored bcrypt hash.
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

//Export the User model, bound to the 'users' collection in MongoDB.
module.exports = mongoose.model('User', userSchema, 'users');
