// const sgMail = require('@sendgrid/mail');

// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// const sendEmail = async ({ to, subject, text, html }) => {
//   try {
//     await sgMail.send({
//       to,
//       from: {
//         email: process.env.SENDGRID_FROM_EMAIL,
//         name: 'e-GAS',
//       },
//       subject,
//       text,
//       html,
//     });
//   } catch (error) {
//     console.error('SendGrid error:', error.response?.body || error);
//     throw error;
//   }
//     console.log('Email server is ready to take messages');
// };

// module.exports = { sendEmail };























// emailConfig.js
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
const FROM_NAME = process.env.RESEND_FROM_NAME || "e-GAS";

/**
 * Simple sendEmail helper using Resend.
 * Returns { id } on success. Throws on failure (matches old SendGrid behavior).
 */
const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const payload = {
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };
    if (text) payload.text = text;

    const { data, error } = await resend.emails.send(payload);

    if (error) {
      console.error("Resend error:", error);
      throw new Error(error.message);
    }

    return data;
  } catch (error) {
    console.error("Resend exception:", error.message);
    throw error;
  }
};

console.log("Email server is ready to take messages (Resend)");

module.exports = { sendEmail, resend };