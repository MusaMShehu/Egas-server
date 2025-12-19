const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const sendEmail = async ({ to, subject, text, html }) => {
  try {
    await sgMail.send({
      to,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL,
        name: 'e-GAS',
      },
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error('SendGrid error:', error.response?.body || error);
    throw error;
  } else {
    console.log('Email server is ready to take messages');
  }
};

module.exports = { sendEmail };
