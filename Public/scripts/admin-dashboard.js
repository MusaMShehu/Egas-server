// Admin Dashboard Specific Functions
function assignOrder(orderId) {
  const staffId = prompt('Enter staff ID to assign this order to:');
  if (staffId) {
    putData(`/api/admin/orders/${orderId}/assign`, { staffId })
      .then(data => {
        showAlert('success', 'Order assigned successfully');
        loadAdminDashboard();
      })
      .catch(error => {
        showAlert('error', 'Failed to assign order');
        console.error(error);
      });
  }
}

function cancelOrder(orderId) {
  if (confirm('Are you sure you want to cancel this order?')) {
    putData(`/api/admin/orders/${orderId}/status`, { status: 'cancelled' })
      .then(data => {
        showAlert('success', 'Order cancelled');
        loadAdminDashboard();
      })
      .catch(error => {
        showAlert('error', 'Failed to cancel order');
        console.error(error);
      });
  }
}

function editProduct(productId) {
  window.location.href = `/admin/products/${productId}/edit`;
}

function updateStock(productId) {
  const newStock = prompt('Enter new stock quantity:');
  if (newStock && !isNaN(newStock)) {
    putData(`/api/admin/products/${productId}`, { stock: parseInt(newStock) })
      .then(data => {
        showAlert('success', 'Stock updated successfully');
        loadAdminDashboard();
      })
      .catch(error => {
        showAlert('error', 'Failed to update stock');
        console.error(error);
      });
  }
}

// Initialize DataTables for admin tables
document.addEventListener('DOMContentLoaded', function() {
  if (document.querySelector('.admin-table')) {
    $('.admin-table').DataTable({
      responsive: true,
      dom: '<"top"lf>rt<"bottom"ip>'
    });
  }
});