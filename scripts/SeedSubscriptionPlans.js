const mongoose = require('mongoose');
const SubscriptionPlan = require('../models/SubscriptionPlan');
require('dotenv').config();

const plansData = [
  {
    name: "Basic Plan",
    description: "Perfect for individuals and small families",
    baseSize: "6kg",
    basePrice: 9000, // 6kg * 1500
    pricePerKg: 1500,
    type: "preset",
    displayOrder: 1,
    features: [
      { title: "Free Delivery", description: "Free delivery to your location", included: true },
      { title: "24/7 Support", description: "Round the clock customer support", included: true },
      { title: "Safety Check", description: "Regular safety inspections", included: true }
    ]
  },
  {
    name: "Family Plan",
    description: "Ideal for medium to large families",
    baseSize: "12kg",
    basePrice: 18000, // 12kg * 1500
    pricePerKg: 1500,
    type: "preset",
    displayOrder: 2,
    features: [
      { title: "Free Delivery", description: "Free delivery to your location", included: true },
      { title: "24/7 Support", description: "Round the clock customer support", included: true },
      { title: "Safety Check", description: "Regular safety inspections", included: true },
      { title: "Priority Service", description: "Priority delivery and support", included: true }
    ]
  },
  {
    name: "Business Plan",
    description: "Designed for businesses and large establishments",
    baseSize: "50kg",
    basePrice: 75000, // 50kg * 1500
    pricePerKg: 1500,
    type: "preset",
    displayOrder: 3,
    features: [
      { title: "Free Delivery", description: "Free delivery to your location", included: true },
      { title: "24/7 Support", description: "Round the clock customer support", included: true },
      { title: "Safety Check", description: "Regular safety inspections", included: true },
      { title: "Priority Service", description: "Priority delivery and support", included: true },
      { title: "Dedicated Manager", description: "Personal account manager", included: true }
    ]
  },
  {
    name: "Custom Plan",
    description: "Tailored to your specific needs",
    baseSize: "6kg",
    basePrice: 9000,
    pricePerKg: 1500,
    type: "custom",
    displayOrder: 4,
    features: [
      { title: "Flexible Sizing", description: "Choose your preferred cylinder size", included: true },
      { title: "Custom Frequency", description: "Set your delivery schedule", included: true },
      { title: "Free Delivery", description: "Free delivery to your location", included: true }
    ]
  },
  {
    name: "One-Time Purchase",
    description: "Single purchase without subscription",
    baseSize: "6kg",
    basePrice: 9000,
    pricePerKg: 1500,
    type: "one-time",
    displayOrder: 5,
    frequencyOptions: ["One-Time"],
    features: [
      { title: "One-time Payment", description: "No recurring charges", included: true },
      { title: "Free Delivery", description: "Free delivery to your location", included: true }
    ]
  }
];

const seedPlans = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing plans
    await SubscriptionPlan.deleteMany({});
    console.log('Cleared existing plans');

    // Insert new plans
    await SubscriptionPlan.insertMany(plansData);
    console.log('Subscription plans seeded successfully');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding plans:', error);
    process.exit(1);
  }
};

seedPlans();