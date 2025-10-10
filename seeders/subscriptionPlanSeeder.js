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
    deliveryFrequency: ["Daily", "Weekly", "Bi-weekly", "Monthly"],
    subscriptionPeriod: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
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
    deliveryFrequency: ["Daily", "Weekly", "Bi-weekly", "Monthly"],
    subscriptionPeriod: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
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
    baseSize: "25kg",
    basePrice: 37500, // 25kg * 1500
    pricePerKg: 1500,
    type: "preset",
    displayOrder: 3,
    deliveryFrequency: ["Daily", "Weekly", "Bi-weekly", "Monthly"],
    subscriptionPeriod: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
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
    cylinderSizeRange: { min: 5, max: 100 },
    deliveryFrequencyRange: { min: 1, max: 29 },
    subscriptionPeriod: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    features: [
      { title: "Flexible Sizing", description: "Choose your preferred cylinder size (5-100kg)", included: true },
      { title: "Custom Frequency", description: "Set your delivery schedule (1-29 days)", included: true },
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
    cylinderSizes: [5, 6, 12, 25, 50],
    frequencyOptions: ["One-Time"],
    features: [
      { title: "One-time Payment", description: "No recurring charges", included: true },
      { title: "Free Delivery", description: "Free delivery to your location", included: true }
    ]
  },
  {
    name: "Emergency Request",
    description: "Immediate delivery for urgent needs",
    baseSize: "6kg",
    basePrice: 10500, // 6kg * (1500 + 250 emergency fee)
    pricePerKg: 1750, // 1500 + 250 emergency fee
    additionalFeePerKg: 250,
    type: "emergency",
    displayOrder: 6,
    cylinderSizes: ["6kg", "12kg", "25kg", "50kg"],
    features: [
      { title: "Immediate Delivery", description: "Priority emergency delivery", included: true },
      { title: "24/7 Availability", description: "Available anytime for urgent needs", included: true },
      { title: "Emergency Support", description: "Dedicated emergency support team", included: true },
      { title: "Express Service", description: "Fastest delivery possible", included: true }
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