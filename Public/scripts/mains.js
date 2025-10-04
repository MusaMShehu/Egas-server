// DOM Ready
document.addEventListener('DOMContentLoaded', function() {
  // Mobile Menu Toggle
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');
  
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', function() {
      navLinks.classList.toggle('active');
      this.classList.toggle('fa-times');
    });
  }
  
  // Initialize all tooltips
  const tooltipTriggers = document.querySelectorAll('[data-tooltip]');
  tooltipTriggers.forEach(trigger => {
    new bootstrap.Tooltip(trigger);
  });
  
  // Initialize all dropdowns
  const dropdowns = document.querySelectorAll('.dropdown-toggle');
  dropdowns.forEach(dropdown => {
    new bootstrap.Dropdown(dropdown);
  });
  
  // Form validation
  const forms = document.querySelectorAll('.needs-validation');
  forms.forEach(form => {
    form.addEventListener('submit', function(event) {
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      
      form.classList.add('was-validated');
    }, false);
  });
  
  // Password visibility toggle
  const passwordToggles = document.querySelectorAll('.password-toggle');
  passwordToggles.forEach(toggle => {
    toggle.addEventListener('click', function() {
      const input = this.previousElementSibling;
      const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
      input.setAttribute('type', type);
      this.classList.toggle('fa-eye');
      this.classList.toggle('fa-eye-slash');
    });
  });
  
  // Tab functionality
  const tabLinks = document.querySelectorAll('[data-tab]');
  tabLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      
      // Hide all tab content
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
      });
      
      // Deactivate all tab links
      document.querySelectorAll('[data-tab]').forEach(tab => {
        tab.classList.remove('active');
      });
      
      // Show selected tab content
      const tabId = this.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
      
      // Activate current tab link
      this.classList.add('active');
    });
  });
  
  // Initialize first tab as active
  if (tabLinks.length > 0) {
    tabLinks[0].click();
  }
  
  // Quantity controls
  document.querySelectorAll('.quantity-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const input = this.parentElement.querySelector('.quantity-input');
      let value = parseInt(input.value);
      
      if (this.classList.contains('minus')) {
        if (value > 1) input.value = value - 1;
      } else {
        input.value = value + 1;
      }
      
      // Trigger change event for any listeners
      input.dispatchEvent(new Event('change'));
    });
  });
  
  // Delivery option selection
  document.querySelectorAll('.delivery-option').forEach(option => {
    option.addEventListener('click', function() {
      document.querySelectorAll('.delivery-option').forEach(opt => {
        opt.classList.remove('selected');
      });
      this.classList.add('selected');
      this.querySelector('input').checked = true;
    });
  });
  
  // Payment method selection
  document.querySelectorAll('.payment-method').forEach(method => {
    method.addEventListener('click', function() {
      document.querySelectorAll('.payment-method').forEach(m => {
        m.classList.remove('selected');
      });
      this.classList.add('selected');
      this.querySelector('input').checked = true;
      
      // Show/hide card fields based on selection
      const cardFields = document.getElementById('cardFields');
      if (this.querySelector('input').id === 'card') {
        cardFields.style.display = 'block';
      } else {
        cardFields.style.display = 'none';
      }
    });
  });
  
  // Initialize card fields visibility
  const cardFields = document.getElementById('cardFields');
  if (cardFields) {
    const cardSelected = document.querySelector('input[name="payment"]:checked');
    if (cardSelected && cardSelected.id === 'card') {
      cardFields.style.display = 'block';
    } else {
      cardFields.style.display = 'none';
    }
  }
});

// AJAX Helper Functions
function fetchData(url, options = {}) {
  return fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    },
    ...options
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    return response.json();
  });
}

function postData(url, data) {
  return fetchData(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

function putData(url, data) {
  return fetchData(url, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

function deleteData(url) {
  return fetchData(url, {
    method: 'DELETE'
  });
}

// Authentication Functions
function login(email, password) {
  return postData('/api/auth/login', { email, password })
    .then(data => {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      return data;
    });
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

function checkAuth() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login';
    return false;
  }
  return true;
}

// User Dashboard Functions
function loadDashboard() {
  if (!checkAuth()) return;
  
  fetchData('/api/user/dashboard')
    .then(data => {
      // Update active orders
      const ordersContainer = document.getElementById('active-orders');
      if (ordersContainer) {
        ordersContainer.innerHTML = data.activeOrders.map(order => `
          <div class="order-item">
            <div>#${order._id}</div>
            <div>${new Date(order.createdAt).toLocaleDateString()}</div>
            <div>${order.items.length} items</div>
            <div class="badge badge-${getStatusClass(order.status)}">${order.status}</div>
            <button class="btn btn-outline btn-sm" onclick="viewOrder('${order._id}')">View</button>
          </div>
        `).join('');
      }
      
      // Update upcoming deliveries
      const deliveriesContainer = document.getElementById('upcoming-deliveries');
      if (deliveriesContainer) {
        deliveriesContainer.innerHTML = data.upcomingDeliveries.map(delivery => `
          <div class="delivery-item">
            <div>${new Date(delivery.deliveryDate).toLocaleDateString()}</div>
            <div>${delivery.items[0].product.name}</div>
            <button class="btn btn-outline btn-sm" onclick="trackDelivery('${delivery._id}')">Track</button>
          </div>
        `).join('');
      }
      
      // Update subscription status
      const subscriptionContainer = document.getElementById('subscription-status');
      if (subscriptionContainer) {
        if (data.subscription) {
          subscriptionContainer.innerHTML = `
            <div class="subscription-active">
              <h4>${data.subscription.planName}</h4>
              <p>Next delivery: ${new Date(data.subscription.nextDelivery).toLocaleDateString()}</p>
              <button class="btn btn-secondary" onclick="manageSubscription('${data.subscription._id}')">Manage</button>
            </div>
          `;
        } else {
          subscriptionContainer.innerHTML = `
            <div class="subscription-inactive">
              <p>You don't have an active subscription</p>
              <button class="btn btn-primary" onclick="window.location.href='/subscribe'">Subscribe Now</button>
            </div>
          `;
        }
      }
      
      // Update account balance
      const balanceContainer = document.getElementById('account-balance');
      if (balanceContainer) {
        balanceContainer.textContent = `₦${data.accountBalance.toLocaleString()}`;
      }
    })
    .catch(error => {
      showAlert('error', 'Failed to load dashboard data');
      console.error(error);
    });
}

function getStatusClass(status) {
  const statusClasses = {
    'pending': 'warning',
    'processing': 'primary',
    'shipped': 'info',
    'delivered': 'success',
    'cancelled': 'danger'
  };
  return statusClasses[status.toLowerCase()] || 'primary';
}

function showAlert(type, message) {
  const alertContainer = document.getElementById('alert-container');
  if (alertContainer) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alertContainer.appendChild(alert);
    
    setTimeout(() => {
      alert.remove();
    }, 5000);
  }
}

// Staff Dashboard Functions
function loadStaffDashboard() {
  if (!checkAuth()) return;
  
  fetchData('/api/staff/dashboard')
    .then(data => {
      // Update assigned orders
      const ordersContainer = document.getElementById('assigned-orders');
      if (ordersContainer) {
        ordersContainer.innerHTML = data.assignedOrders.map(order => `
          <tr>
            <td>#${order._id}</td>
            <td>${order.customer.name}</td>
            <td>${order.deliveryAddress}</td>
            <td>${order.deliveryTime}</td>
            <td><span class="badge badge-${getStatusClass(order.status)}">${order.status}</span></td>
            <td>
              <button class="btn btn-success btn-sm" onclick="updateOrderStatus('${order._id}', 'picked-up')">
                <i class="fas fa-check"></i> Picked Up
              </button>
              <button class="btn btn-danger btn-sm" onclick="reportIssue('${order._id}')">
                <i class="fas fa-exclamation"></i> Issue
              </button>
            </td>
          </tr>
        `).join('');
      }
      
      // Update support tickets
      const ticketsContainer = document.getElementById('assigned-tickets');
      if (ticketsContainer) {
        ticketsContainer.innerHTML = data.assignedTickets.map(ticket => `
          <div class="ticket-card">
            <h4>#${ticket._id} - ${ticket.subject}</h4>
            <p>${ticket.message.substring(0, 100)}...</p>
            <div class="ticket-actions">
              <button class="btn btn-primary btn-sm" onclick="respondToTicket('${ticket._id}')">
                <i class="fas fa-reply"></i> Respond
              </button>
              <button class="btn btn-warning btn-sm" onclick="escalateTicket('${ticket._id}')">
                <i class="fas fa-arrow-up"></i> Escalate
              </button>
            </div>
          </div>
        `).join('');
      }
    })
    .catch(error => {
      showAlert('error', 'Failed to load staff dashboard');
      console.error(error);
    });
}

// Admin Dashboard Functions
function loadAdminDashboard() {
  if (!checkAuth()) return;
  
  fetchData('/api/admin/dashboard')
    .then(data => {
      // Update stats
      document.getElementById('total-orders').textContent = data.todaysOrders;
      document.getElementById('active-subscriptions').textContent = data.activeSubscriptions;
      document.getElementById('todays-revenue').textContent = `₦${data.todaysRevenue.toLocaleString()}`;
      document.getElementById('inventory-level').textContent = `${data.inventoryLevel}%`;
      
      // Update recent orders
      const ordersTable = document.getElementById('recent-orders-table');
      if (ordersTable) {
        ordersTable.innerHTML = data.recentOrders.map(order => `
          <tr>
            <td>#${order._id}</td>
            <td>${order.user.name}</td>
            <td>₦${order.totalAmount.toLocaleString()}</td>
            <td><span class="badge badge-${getStatusClass(order.status)}">${order.status}</span></td>
            <td>${order.assignedTo ? order.assignedTo.name : 'Unassigned'}</td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="assignOrder('${order._id}')">Assign</button>
              <button class="btn btn-danger btn-sm" onclick="cancelOrder('${order._id}')">Cancel</button>
            </td>
          </tr>
        `).join('');
      }
      
      // Update staff performance
      const performanceContainer = document.getElementById('staff-performance');
      if (performanceContainer) {
        performanceContainer.innerHTML = data.staffPerformance.map(staff => `
          <div class="staff-performance-item">
            <div class="staff-name">${staff.staffName}</div>
            <div class="progress">
              <div class="progress-bar" style="width: ${Math.min(100, staff.efficiency * 100)}%"></div>
            </div>
            <div class="stats">${staff.completed} deliveries</div>
          </div>
        `).join('');
      }
    })
    .catch(error => {
      showAlert('error', 'Failed to load admin dashboard');
      console.error(error);
    });
}

// Initialize appropriate dashboard based on page
if (document.body.classList.contains('user-dashboard')) {
  loadDashboard();
} else if (document.body.classList.contains('staff-dashboard')) {
  loadStaffDashboard();
} else if (document.body.classList.contains('admin-dashboard')) {
  loadAdminDashboard();
}