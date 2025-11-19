// config/emailConfig.js
const nodemailer = require('nodemailer');

const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

const transporter = nodemailer.createTransport(emailConfig);

// Verify connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.log('Error with email configuration:', error);
  } else {
    console.log('Email server is ready to take messages');
  }
});

module.exports = transporter;