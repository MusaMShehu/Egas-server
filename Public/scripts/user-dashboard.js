// // User Dashboard Specific Functions
// function viewOrder(orderId) {
//   window.location.href = `/orders/${orderId}`;
// }

// function trackDelivery(orderId) {
//   window.location.href = `/tracking/${orderId}`;
// }

// function manageSubscription(subscriptionId) {
//   window.location.href = `/subscriptions/${subscriptionId}`;
// }

// function placeOrder() {
//   const orderData = {
//     items: Array.from(document.querySelectorAll('.cart-item')).map(item => ({
//       product: item.dataset.productId,
//       quantity: parseInt(item.querySelector('.quantity').value)
//     })),
//     deliveryAddress: document.getElementById('delivery-address').value,
//     paymentMethod: document.querySelector('input[name="payment"]:checked').value,
//     deliveryDate: document.getElementById('delivery-date').value,
//     deliveryTime: document.getElementById('delivery-time').value
//   };
  
//   postData('/api/orders', orderData)
//     .then(data => {
//       showAlert('success', 'Order placed successfully!');
//       window.location.href = `/orders/${data._id}`;
//     })
//     .catch(error => {
//       showAlert('error', 'Failed to place order');
//       console.error(error);
//     });
// }

// // Initialize date picker for delivery date
// if (document.getElementById('delivery-date')) {
//   flatpickr('#delivery-date', {
//     minDate: 'today',
//     dateFormat: 'Y-m-d'
//   });
// }

// // Initialize time picker for delivery time
// if (document.getElementById('delivery-time')) {
//   flatpickr('#delivery-time', {
//     enableTime: true,
//     noCalendar: true,
//     dateFormat: 'H:i',
//     minTime: '08:00',
//     maxTime: '18:00'
//   });
// }