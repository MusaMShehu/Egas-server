const pageTitle = document.getElementById('page-title');
        const pageContent = document.getElementById('page-content');
        const navLinks = document.querySelectorAll('.nav-link');
        const pages = document.querySelectorAll('.page');
        const username = document.getElementById('username');
        const activeOrdersCount = document.getElementById('active-orders-count');
        const upcomingDeliveries = document.getElementById('upcoming-deliveries');
        const nextDeliveryDate = document.getElementById('next-delivery-date');
        const subscriptionStatus = document.getElementById('subscription-status');
        const subscriptionType = document.getElementById('subscription-type');
        const accountBalance = document.getElementById('account-balance');
        const recentOrdersBody = document.getElementById('recent-orders-body');
        const subscriptionDetails = document.getElementById('subscription-details');
        const deliveryStatusContainer = document.getElementById('delivery-status-container');
        const notificationBell = document.getElementById('notification-bell');
        const notificationCount = document.getElementById('notification-count');
        const notificationPanel = document.getElementById('notification-panel');
        const closeNotifications = document.getElementById('close-notifications');
        const notificationList = document.getElementById('notification-list');
        const modalOverlay = document.getElementById('modal-overlay');
        const refreshBalance = document.getElementById('refresh-balance');
        const quickOrderGas = document.getElementById('quick-order-gas');
        const quickManageSubscription = document.getElementById('quick-manage-subscription');
        const quickTopUp = document.getElementById('quick-top-up');
        const quickSupport = document.getElementById('quick-support');
        const viewAllOrders = document.getElementById('view-all-orders');
        const manageSubscription = document.getElementById('manage-subscription');
        const logoutBtn = document.getElementById('logout-btn');

        // // Quick fetch without error handling
        // const getDashboardData = () =>
        //     fetch('http://localhost:5000/api/v1/dashboard', {
        //         headers: {
        //             'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        //         }
        //     }).then(res => res.json());

        // Initialize the dashboard



  async function initDashboard() {
    try {
      const token = localStorage.getItem("token");
      const userId = localStorage.getItem("userId");

      if (!token || !userId) {
        console.error("User not logged in");
        return;
      }

      // ✅ Fetch user profile
      const userRes = await fetch(`http://localhost:5000/api/v1/users/${userId}`, {
        headers: {
          "Authorization": "Bearer " + token
        }
      });

      if (!userRes.ok) throw new Error("Failed to load user profile");
      const userData = await userRes.json();

      // Set username on dashboard
      const username = document.getElementById("username");
      if (username) {
        username.textContent = `${userData.firstName} ${userData.lastName}`;
      }

      // ✅ Load dashboard sections
      await Promise.all([
        updateDashboardStats(),
        loadRecentOrders(),
        loadSubscriptionDetails(),
        loadDeliveryStatus(),
        loadNotifications()
      ]);
    } catch (err) {
      console.error("Error initializing dashboard:", err);
    }
  }

  //  Dashboard stats (GET /api/stats)
  async function updateDashboardStats() {
    const res = await fetch("http://localhost:5000/api/v1/dashboard", {
      headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
    });
    if (!res.ok) return;
    const stats = await res.json();

    document.getElementById("totalOrders").textContent = stats.totalOrders;
    document.getElementById("activeOrders").textContent = stats.activeOrders;
    document.getElementById("subscriptions").textContent = stats.subscriptions;
  }

  // Example: Recent orders (GET /api/orders/recent)
  async function loadRecentOrders() {
    const res = await fetch("http://localhost:5000/api/v1/orders", {
      headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
    });
    if (!res.ok) return;
    const orders = await res.json();

    const container = document.getElementById("recentOrders");
    container.innerHTML = "";
    orders.forEach(order => {
      const div = document.createElement("div");
      div.className = "p-3 border-b";
      div.innerHTML = `
        <p><strong>Order #${order._id}</strong> - ${order.status}</p>
        <p class="text-sm text-gray-600">Total: ₦${order.total}</p>
      `;
      container.appendChild(div);
    });
  }

  // Example: Subscriptions (GET /api/subscriptions/:userId)
  async function loadSubscriptionDetails() {
    const userId = localStorage.getItem("userId");
    const res = await fetch(`http://localhost:5000/api/v1/subscriptions/${userId}`, {
      headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
    });
    if (!res.ok) return;
    const subs = await res.json();

    const container = document.getElementById("subscriptionsList");
    container.innerHTML = "";
    subs.forEach(sub => {
      const div = document.createElement("div");
      div.className = "p-3 border rounded mb-2";
      div.innerHTML = `
        <p>Plan: ${sub.plan}</p>
        <p>Status: ${sub.status}</p>
        <p>Next Renewal: ${new Date(sub.nextRenewal).toLocaleDateString()}</p>
      `;
      container.appendChild(div);
    });
  }

  // Example: Delivery Status (GET /api/orders/active)
  async function loadDeliveryStatus() {
    const res = await fetch("http://localhost:5000/api/v1/orders/active", {
      headers: { "Authorization": "Bearer " + localStorage.getItem("token") }
    });
    if (!res.ok) return;
    const activeOrders = await res.json();

    const container = document.getElementById("deliveryStatus");
    container.innerHTML = "";
    activeOrders.forEach(order => {
      const div = document.createElement("div");
      div.className = "p-3 border rounded mb-2";
      div.innerHTML = `
        <h4>Order #${order.id} - ${order.status}</h4>
        <p>Items: ${order.items.map(i => `${i.name} (x${i.qty})`).join(", ")}</p>
        <p>Total: ₦${order.total}</p>
      `;
      container.appendChild(div);
    });
  }

    //Notifications

async function loadNotifications() {
    try {
      const userId = localStorage.getItem("userId"); // or decode from JWT
      const response = await fetch(`http://localhost:5000/api/notifications/${userId}`, {
        headers: {
          "Content-Type": "application/json",
          // if using JWT auth:
          "Authorization": "Bearer " + localStorage.getItem("token")
        }
      });

      if (!response.ok) {
        throw new Error("Failed to fetch notifications");
      }

      const notifications = await response.json();

      // DOM containers
      const notificationList = document.getElementById("notificationList");
      const notificationCount = document.getElementById("notificationCount");

      notificationList.innerHTML = ""; // Clear old ones

      const unreadCount = notifications.filter(n => !n.read).length;

      // Update badge
      if (unreadCount > 0) {
        notificationCount.textContent = unreadCount;
        notificationCount.classList.remove("hidden");
      } else {
        notificationCount.classList.add("hidden");
      }

      // Build notification cards
      notifications.forEach(notification => {
        const notificationItem = document.createElement("div");
        notificationItem.className =
          `p-3 border rounded mb-2 ${notification.read ? "bg-white" : "bg-blue-50"}`;

        notificationItem.innerHTML = `
          <div class="flex justify-between">
            <h4 class="font-medium">${notification.title}</h4>
            <span class="text-xs text-gray-500">${new Date(notification.date).toLocaleString()}</span>
          </div>
          <p class="text-sm text-gray-700">${notification.message}</p>
        `;

        notificationList.appendChild(notificationItem);
      });

    } catch (error) {
      console.error("Error loading notifications:", error);
      document.getElementById("notificationList").innerHTML =
        <p class="text-red-500">Could not load notifications.</p>;
    }
  }

  // Run when page loads
  window.onload = initDashboard;
            

  // Update dashboard statistics
function updateDashboardStats(userData) {
  // Count active orders (not delivered)
  const activeOrders = userData.recentOrders.filter(order => order.status !== 'delivered').length;
  activeOrdersCount.textContent = activeOrders;

  // Subscription & deliveries
  upcomingDeliveries.textContent = userData.subscription.active ? "Active" : "Inactive";
  nextDeliveryDate.textContent = `Next: ${formatDate(userData.subscription.nextDelivery)}`;

  // Subscription status & type
  subscriptionStatus.textContent = userData.subscription.status || "Unknown";
  subscriptionType.textContent = 
    userData.subscription.type 
      ? `${userData.subscription.type.replace(/\w/, c => c.toUpperCase())} Auto-Refill`
      : "N/A";

  // Wallet balance
  accountBalance.textContent = 
    userData.walletBalance !== undefined 
      ? `₦${userData.walletBalance.toLocaleString()}`
      : "$0";
}


        // Load recent orders
        async function loadRecentOrders() {
  const token = localStorage.getItem("token"); // get JWT token saved at login
  if (!token) {
    window.location.href = "index.html"; // redirect if not logged in
    return;
  }

  try {
    // 1. Fetch user orders from server
    const response = await fetch("http://localhost:5000/api/v1/dashboard/orders", {
      headers: { "Authorization": "Bearer " + token }
    });
    const orders = await response.json();

    // 2. Clear table body first
    const recentOrdersBody = document.getElementById("recentOrdersBody");
    recentOrdersBody.innerHTML = "";

    // 3. Loop through orders and build rows
    orders.forEach(order => {
      const row = document.createElement("tr");
      row.className = "border-b";

      row.innerHTML = `
        <td class="py-2 px-4">${order.id}</td>
        <td class="py-2 px-4">${formatDate(order.date)}</td>
        <td class="py-2 px-4">${order.product}</td>
        <td class="py-2 px-4">${order.quantity}</td>
        <td class="py-2 px-4">$${order.amount.toLocaleString()}</td>
        <td class="py-2 px-4">
          <span class="${getStatusClass(order.status)} px-2 py-1 rounded">
            ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
          </span>
        </td>
        <td class="py-2 px-4">
          ${order.status === "processing"
            ? <button class="text-blue-600 hover:underline track-order" data-order="${order.id}">Track</button>
            : <button class="text-blue-600 hover:underline view-invoice" data-order="${order.id}">View Invoice</button>
          }
        </td>
      `;

      recentOrdersBody.appendChild(row);
    });
  } catch (err) {
    console.error("Error loading orders:", err);
  }
}

// Example date formatter
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString();
}

// Example status color helper
function getStatusClass(status) {
  switch (status) {
    case "completed": return "bg-green-100 text-green-800";
    case "processing": return "bg-yellow-100 text-yellow-800";
    case "cancelled": return "bg-red-100 text-red-800";
    default: return "bg-gray-100 text-gray-800";
  }
}











// Call function when page loads
loadRecentOrders();
        // Load subscription details
        function loadSubscriptionDetails() {
            if (userData.subscription.active) {
                subscriptionDetails.innerHTML = `
                    <div class="space-y-2">
                        <div class="flex justify-between">
                            <span class="text-gray-600">Plan:</span>
                            <span class="font-medium">${userData.subscription.type.replace(/^\w/, c => c.toUpperCase())} Auto-Refill</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Product:</span>
                            <span class="font-medium">${userData.subscription.product}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Price:</span>
                            <span class="font-medium">₦${userData.subscription.price.toLocaleString()}/month</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-600">Next Delivery:</span>
                            <span class="font-medium">${formatDate(userData.subscription.nextDelivery)}</span>
                        </div>
                    </div>
                `;
            } else {
                subscriptionDetails.innerHTML = `
                    <p class="text-gray-600">You don't have an active subscription.</p>
                    <button class="mt-2 bg-blue-600 text-white px-4 py-2 rounded" id="subscribe-now">
                        Subscribe Now
                    </button>
                `;
            }
        }

        // Load delivery status
        function loadDeliveryStatus() {
            const activeOrder = userData.recentOrders.find(order => order.status === 'processing');

            if (activeOrder && activeOrder.tracking) {
                deliveryStatusContainer.innerHTML = `
                    <div class="space-y-4">
                        <div>
                            <h3 class="font-medium">Order #${activeOrder.id}</h3>
                            <p class="text-sm text-gray-600">Estimated delivery: ${formatDate(activeOrder.deliveryDate)}</p>
                        </div>
                        
                        <div class="space-y-2">
                            <div class="flex justify-between text-sm">
                                <span>Order Placed</span>
                                <span>Shipped</span>
                                <span>In Transit</span>
                                <span>Delivered</span>
                            </div>
                            <div class="h-2 bg-gray-200 rounded-full">
                                <div class="h-2 bg-blue-500 rounded-full" style="width: ${activeOrder.tracking.progress}%"></div>
                            </div>
                        </div>
                        
                        <div class="bg-blue-50 p-3 rounded">
                            <p class="text-sm">
                                <span class="font-medium">Current Status:</span> 
                                ${activeOrder.tracking.status.replace('-', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                            </p>
                            <p class="text-sm mt-1">
                                <span class="font-medium">Location:</span> ${activeOrder.tracking.location}
                            </p>
                        </div>
                        
                        <button class="w-full bg-blue-600 text-white py-2 rounded mt-2" id="track-order">
                            View Full Tracking
                        </button>
                    </div>
                `;
            } else {
                deliveryStatusContainer.innerHTML = `
                    <p class="text-gray-600">No active deliveries at the moment.</p>
                `;
            }
        }

        // Load notifications
        function loadNotifications() {
            const unreadCount = userData.notifications.filter(n => !n.read).length;

            if (unreadCount > 0) {
                notificationCount.textContent = unreadCount;
                notificationCount.classList.remove('hidden');
            } else {
                notificationCount.classList.add('hidden');
            }

            // Load notification panel content
            notificationList.innerHTML = '';
            userData.notifications.forEach(notification => {
                const notificationItem = document.createElement('div');
                notificationItem.className = `p-3 border-b ${notification.read ? 'bg-white' : 'bg-blue-50'}`;
                notificationItem.innerHTML = `
                    <div class="flex justify-between">
                        <h4 class="font-medium">${notification.title}</h4>
                        <span class="text-xs text-gray-500">${formatDate(notification.date, true)}</span>
                    </div>
                    <p class="text-sm mt-1">${notification.message}</p>
                `;
                notificationList.appendChild(notificationItem);
            });
        }

        // Initialize consumption chart
        function initConsumptionChart() {
            const ctx = document.getElementById('consumption-chart').getContext('2d');

            // Sample data - in a real app, this would come from an API
            const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
            const data = [12, 19, 15, 12, 10, 8]; // kg of gas per month

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Gas Consumption (kg)',
                        data: data,
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'kg'
                            }
                        }
                    }
                }
            });
        }

        // Set up event listeners
        function setupEventListeners() {
            // Navigation links
            navLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const page = link.getAttribute('data-page');
                    showPage(page);

                    // Update active state
                    navLinks.forEach(nav => nav.classList.remove('bg-blue-700', 'active'));
                    link.classList.add('bg-blue-700', 'active');
                });
            });

            // Notification bell
            notificationBell.addEventListener('click', () => {
                notificationPanel.classList.toggle('translate-x-full');
                modalOverlay.classList.toggle('hidden');

                // Mark notifications as read when panel is opened
                userData.notifications.forEach(n => n.read = true);
                loadNotifications();
            });

            // Close notifications
            closeNotifications.addEventListener('click', () => {
                notificationPanel.classList.add('translate-x-full');
                modalOverlay.classList.add('hidden');
            });

            // Modal overlay
            modalOverlay.addEventListener('click', () => {
                notificationPanel.classList.add('translate-x-full');
                modalOverlay.classList.add('hidden');
            });

            // Quick actions
            quickOrderGas.addEventListener('click', () => showPage('order-gas'));
            quickManageSubscription.addEventListener('click', () => showPage('subscriptions'));
            quickTopUp.addEventListener('click', () => showPage('payments'));
            quickSupport.addEventListener('click', () => showPage('support'));
            viewAllOrders.addEventListener('click', () => showPage('order-history'));
            manageSubscription.addEventListener('click', () => showPage('subscriptions'));

            // Refresh balance
            refreshBalance.addEventListener('click', () => {
                // Simulate balance refresh
                accountBalance.textContent = `₦${userData.walletBalance.toLocaleString()}`;

                // Show refresh feedback
                refreshBalance.innerHTML = '<i class="fas fa-check mr-1"></i> Updated';
                setTimeout(() => {
                    refreshBalance.innerHTML = '<i class="fas fa-sync-alt mr-1"></i> Refresh';
                }, 2000);
            });

            // Logout
            logoutBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to logout?')) {
                    // In a real app, this would redirect to logout endpoint
                    alert('You have been logged out. Redirecting to login page...');
                    window.location.href = 'login.html';
                }
            });
        }

        // Show specific page
        function showPage(page) {
            // Hide all pages
            pages.forEach(p => p.classList.add('hidden'));

            // Show selected page
            document.getElementById(`${page}-page`).classList.remove('hidden');

            // Update page title
            const title = document.querySelector(`.nav-link[data-page="${page}"]`).textContent.trim();
            pageTitle.textContent = title;

            // Load page-specific content
            switch (page) {
                case 'order-gas':
                    loadOrderGasPage();
                    break;
                case 'subscriptions':
                    loadSubscriptionsPage();
                    break;
                case 'order-history':
                    loadOrderHistoryPage();
                    break;
                case 'payments':
                    loadPaymentsPage();
                    break;
                case 'profile':
                    loadProfilePage();
                    break;
                case 'support':
                    loadSupportPage();
                    break;
                case 'settings':
                    loadSettingsPage();
                    break;
            }
        }

        // Load Order Gas page
        function loadOrderGasPage() {
            const productList = document.getElementById('product-list');
            const orderSummary = document.getElementById('order-summary');
            const deliveryOptions = document.getElementById('delivery-options');
            const paymentOptions = document.getElementById('payment-options');
            const walletBalanceSummary = document.getElementById('wallet-balance-summary');

            // Load products
            productList.innerHTML = '';
            userData.products.forEach(product => {
                const productCard = document.createElement('div');
                productCard.className = 'border rounded p-4 cursor-pointer product-card hover:border-blue-500';
                productCard.setAttribute('data-id', product.id);
                productCard.innerHTML = `
                    <div class="flex items-start">
                        <img src="${product.image}" alt="${product.name}" class="w-16 h-16 object-cover rounded mr-3">
                        <div>
                            <h4 class="font-medium">${product.name}</h4>
                            <p class="text-gray-600 text-sm">${product.description}</p>
                            <p class="text-blue-600 font-bold mt-1">₦${product.price.toLocaleString()}</p>
                        </div>
                    </div>
                `;
                productList.appendChild(productCard);
            });

            // Set wallet balance
            walletBalanceSummary.textContent = userData.walletBalance.toLocaleString();

            // Product selection
            document.querySelectorAll('.product-card').forEach(card => {
                card.addEventListener('click', () => {
                    // Remove active state from all cards
                    document.querySelectorAll('.product-card').forEach(c =>
                        c.classList.remove('border-blue-500', 'bg-blue-50'));

                    // Add active state to selected card
                    card.classList.add('border-blue-500', 'bg-blue-50');

                    const productId = parseInt(card.getAttribute('data-id'));
                    const product = userData.products.find(p => p.id === productId);

                    // Update order summary
                    orderSummary.innerHTML = `
                        <div class="flex justify-between mb-2">
                            <span class="text-gray-600">Product:</span>
                            <span class="font-medium">${product.name}</span>
                        </div>
                        <div class="flex justify-between mb-2">
                            <span class="text-gray-600">Unit Price:</span>
                            <span class="font-medium">₦${product.price.toLocaleString()}</span>
                        </div>
                        <div class="flex justify-between mb-2">
                            <span class="text-gray-600">Quantity:</span>
                            <div class="flex items-center">
                                <button class="px-2 border rounded quantity-btn" data-action="decrease">-</button>
                                <span class="mx-2 w-8 text-center" id="quantity">1</span>
                                <button class="px-2 border rounded quantity-btn" data-action="increase">+</button>
                            </div>
                        </div>
                        <div class="border-t pt-2 mt-2">
                            <div class="flex justify-between font-bold">
                                <span>Total:</span>
                                <span id="order-total">₦${product.price.toLocaleString()}</span>
                            </div>
                        </div>
                    `;

                    // Show delivery options
                    deliveryOptions.classList.remove('hidden');

                    // Set up quantity buttons
                    document.querySelectorAll('.quantity-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            const action = btn.getAttribute('data-action');
                            let quantity = parseInt(document.getElementById('quantity').textContent);
                            const price = product.price;

                            if (action === 'increase') {
                                quantity++;
                            } else if (action === 'decrease' && quantity > 1) {
                                quantity--;
                            }

                            document.getElementById('quantity').textContent = quantity;
                            document.getElementById('order-total').textContent = `₦${(price * quantity).toLocaleString()}`;
                        });
                    });

                    // Show payment options when delivery option is selected
                    document.querySelectorAll('input[name="delivery"]').forEach(radio => {
                        radio.addEventListener('change', () => {
                            paymentOptions.classList.remove('hidden');
                        });
                    });
                });
            });

            // Place order button
            document.getElementById('place-order-btn').addEventListener('click', () => {
                alert('Order placed successfully!');
                showPage('dashboard');
                // In a real app, this would send the order to the server
            });
        }

        // Load Subscriptions page
        function loadSubscriptionsPage() {
            const activeSubscriptionContainer = document.getElementById('active-subscription-container');
            const subscriptionPlans = document.getElementById('subscription-plans');

            // Load active subscription
            if (userData.subscription.active) {
                activeSubscriptionContainer.innerHTML = `
                    <div class="bg-blue-50 p-4 rounded border border-blue-200">
                        <div class="flex justify-between items-start">
                            <div>
                                <h3 class="font-bold">Active Subscription</h3>
                                <p class="text-gray-600">${userData.subscription.type.replace(/^\w/, c => c.toUpperCase())} Auto-Refill</p>
                            </div>
                            <span class="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">Active</span>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                            <div>
                                <p class="text-gray-600 text-sm">Product</p>
                                <p class="font-medium">${userData.subscription.product}</p>
                            </div>
                            <div>
                                <p class="text-gray-600 text-sm">Price</p>
                                <p class="font-medium">₦${userData.subscription.price.toLocaleString()}/month</p>
                            </div>
                            <div>
                                <p class="text-gray-600 text-sm">Next Delivery</p>
                                <p class="font-medium">${formatDate(userData.subscription.nextDelivery)}</p>
                            </div>
                        </div>
                        
                        <div class="flex space-x-3 mt-4">
                            <button class="bg-blue-600 text-white px-4 py-2 rounded text-sm" id="modify-subscription">
                                Modify
                            </button>
                            <button class="bg-gray-200 text-gray-800 px-4 py-2 rounded text-sm" id="cancel-subscription">
                                Cancel
                            </button>
                        </div>
                    </div>
                `;
            } else {
                activeSubscriptionContainer.innerHTML = `
                    <div class="bg-gray-50 p-4 rounded border border-gray-200 text-center">
                        <p class="text-gray-600 mb-3">You don't have an active subscription</p>
                        <button class="bg-blue-600 text-white px-4 py-2 rounded" id="subscribe-now">
                            Subscribe Now
                        </button>
                    </div>
                `;
            }

            // Load subscription plans
            subscriptionPlans.innerHTML = '';
            userData.subscriptionPlans.forEach(plan => {
                const planCard = document.createElement('div');
                planCard.className = 'border rounded p-4 hover:border-blue-500';
                planCard.innerHTML = `
                    <h4 class="font-bold mb-1">${plan.name}</h4>
                    <p class="text-gray-600 text-sm mb-2">${plan.product}</p>
                    <p class="text-2xl font-bold mb-2">₦${plan.price.toLocaleString()}</p>
                    <p class="text-green-600 text-sm mb-3">${plan.savings}</p>
                    <button class="w-full bg-blue-600 text-white py-2 rounded subscribe-btn" data-plan="${plan.id}">
                        Choose Plan
                    </button>
                `;
                subscriptionPlans.appendChild(planCard);
            });

            // Subscribe buttons
            document.querySelectorAll('.subscribe-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const planId = parseInt(btn.getAttribute('data-plan'));
                    const plan = userData.subscriptionPlans.find(p => p.id === planId);

                    if (confirm(`Confirm subscription to ${plan.name} for ₦${plan.price.toLocaleString()} per month?`)) {
                        // In a real app, this would send to the server
                        alert('Subscription activated successfully!');
                        userData.subscription = {
                            active: true,
                            type: "monthly",
                            product: plan.product,
                            price: plan.price,
                            nextDelivery: getNextMonthDate(),
                            status: "active"
                        };
                        loadSubscriptionsPage();
                        updateDashboardStats();
                    }
                });
            });

            // Cancel subscription button
            if (document.getElementById('cancel-subscription')) {
                document.getElementById('cancel-subscription').addEventListener('click', () => {
                    if (confirm('Are you sure you want to cancel your subscription?')) {
                        // In a real app, this would send to the server
                        alert('Subscription cancelled successfully!');
                        userData.subscription.active = false;
                        loadSubscriptionsPage();
                        updateDashboardStats();
                    }
                });
            }
        }

        // Load Order History page
        function loadOrderHistoryPage() {
            const orderHistoryBody = document.getElementById('order-history-body');
            const orderHistoryCount = document.getElementById('order-history-count');

            // Load orders
            orderHistoryBody.innerHTML = '';
            userData.orderHistory.forEach(order => {
                const row = document.createElement('tr');
                row.className = 'border-b';
                row.innerHTML = `
                    <td class="py-2 px-4">${order.id}</td>
                    <td class="py-2 px-4">${formatDate(order.date)}</td>
                    <td class="py-2 px-4">${order.product}</td>
                    <td class="py-2 px-4">${order.quantity}</td>
                    <td class="py-2 px-4">₦${order.amount.toLocaleString()}</td>
                    <td class="py-2 px-4">
                        <span class="${getStatusClass(order.status)} px-2 py-1 rounded">
                            ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                    </td>
                    <td class="py-2 px-4">
                        <button class="text-blue-600 hover:underline mr-2 view-order" data-order="${order.id}">
                            View
                        </button>
                        ${order.status === 'delivered' ?
                        '<button class="text-blue-600 hover:underline view-invoice" data-order="' + order.id + '">Invoice</button>' : ''}
                    </td>
                `;
                orderHistoryBody.appendChild(row);
            });

            // Update order count
            orderHistoryCount.textContent = `Showing ${userData.orderHistory.length} orders`;

            // View order buttons
            document.querySelectorAll('.view-order').forEach(btn => {
                btn.addEventListener('click', () => {
                    const orderId = btn.getAttribute('data-order');
                    const order = userData.orderHistory.find(o => o.id === orderId);
                    showOrderDetails(order);
                });
            });

            // View invoice buttons
            document.querySelectorAll('.view-invoice').forEach(btn => {
                btn.addEventListener('click', () => {
                    const orderId = btn.getAttribute('data-order');
                    alert(`Invoice for order ${orderId} would be displayed here`);
                });
            });
        }

        // Show order details modal
        function showOrderDetails(order) {
            // In a real app, this would be a proper modal
            alert(`Order Details:\n\nID: ${order.id}\nDate: ${formatDate(order.date)}\nProduct: ${order.product}\nQuantity: ${order.quantity}\nAmount: ₦${order.amount.toLocaleString()}\nStatus: ${order.status}`);
        }

        // Load Payments page
        function loadPaymentsPage() {
            const walletBalance = document.getElementById('wallet-balance');
            const totalSpent = document.getElementById('total-spent');
            const pendingPayments = document.getElementById('pending-payments');
            const transactionHistoryBody = document.getElementById('transaction-history-body');
            const transactionHistoryCount = document.getElementById('transaction-history-count');

            // Update wallet stats
            walletBalance.textContent = `₦${userData.walletBalance.toLocaleString()}`;

            // Calculate total spent (sum of all debit transactions)
            const total = userData.transactions
                .filter(tx => tx.type === 'debit')
                .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
            totalSpent.textContent = `₦${total.toLocaleString()}`;

            // Calculate pending payments
            const pending = userData.transactions
                .filter(tx => tx.status === 'pending')
                .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
            pendingPayments.textContent = `₦${pending.toLocaleString()}`;

            // Load transaction history
            transactionHistoryBody.innerHTML = '';
            userData.transactions.forEach(tx => {
                const row = document.createElement('tr');
                row.className = 'border-b';
                row.innerHTML = `
                    <td class="py-2 px-4">${formatDate(tx.date)}</td>
                    <td class="py-2 px-4">${tx.id}</td>
                    <td class="py-2 px-4">${tx.description}</td>
                    <td class="py-2 px-4 ${tx.type === 'credit' ? 'text-green-600' : 'text-red-600'}">
                        ${tx.type === 'credit' ? '+' : '-'}₦${Math.abs(tx.amount).toLocaleString()}
                    </td>
                    <td class="py-2 px-4">
                        <span class="${getStatusClass(tx.status)} px-2 py-1 rounded">
                            ${tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                        </span>
                    </td>
                    <td class="py-2 px-4">
                        <button class="text-blue-600 hover:underline view-receipt" data-tx="${tx.id}">
                            View
                        </button>
                    </td>
                `;
                transactionHistoryBody.appendChild(row);
            });

            // Update transaction count
            transactionHistoryCount.textContent = `Showing ${userData.transactions.length} transactions`;

            // Amount buttons
            document.querySelectorAll('.amount-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    // Remove active state from all buttons
                    document.querySelectorAll('.amount-btn').forEach(b =>
                        b.classList.remove('border-blue-500', 'bg-blue-50'));

                    // Add active state to clicked button
                    btn.classList.add('border-blue-500', 'bg-blue-50');

                    const amount = parseInt(btn.getAttribute('data-amount'));
                    document.getElementById('custom-amount').value = amount;

                    // Show payment method container
                    document.getElementById('payment-method-container').classList.remove('hidden');
                    document.getElementById('payment-amount').textContent = amount.toLocaleString();
                });
            });

            // Custom amount
            document.getElementById('custom-top-up').addEventListener('click', () => {
                const amount = parseInt(document.getElementById('custom-amount').value);

                if (amount && amount > 0) {
                    // Show payment method container
                    document.getElementById('payment-method-container').classList.remove('hidden');
                    document.getElementById('payment-amount').textContent = amount.toLocaleString();

                    // Remove active state from amount buttons
                    document.querySelectorAll('.amount-btn').forEach(b =>
                        b.classList.remove('border-blue-500', 'bg-blue-50'));
                } else {
                    alert('Please enter a valid amount');
                }
            });

            // Payment methods
            document.querySelectorAll('.payment-method').forEach(method => {
                method.addEventListener('click', () => {
                    // Remove active state from all methods
                    document.querySelectorAll('.payment-method').forEach(m =>
                        m.classList.remove('border-blue-500', 'bg-blue-50', 'active'));

                    // Add active state to clicked method
                    method.classList.add('border-blue-500', 'bg-blue-50', 'active');

                    // Show relevant payment details
                    const methodType = method.getAttribute('data-method');

                    // Hide all payment detail sections
                    document.querySelectorAll('[id$="-payment-details"]').forEach(el =>
                        el.classList.add('hidden'));

                    // Show selected payment details
                    if (methodType === 'card') {
                        document.getElementById('card-payment-details').classList.remove('hidden');
                    }
                    // Other payment methods would be handled similarly
                });
            });

            // Confirm payment
            document.getElementById('confirm-payment').addEventListener('click', () => {
                const amount = parseInt(document.getElementById('payment-amount').textContent.replace(/,/g, ''));
                const method = document.querySelector('.payment-method.active').getAttribute('data-method');

                if (confirm(`Confirm payment of ₦${amount.toLocaleString()} via ${method}?`)) {
                    // In a real app, this would process the payment
                    alert('Payment successful! Your wallet has been topped up.');

                    // Update wallet balance
                    userData.walletBalance += amount;
                    walletBalance.textContent = `₦${userData.walletBalance.toLocaleString()}`;
                    updateDashboardStats();

                    // Add transaction
                    const txId = `TX-${Math.floor(1000 + Math.random() * 9000)}`;
                    userData.transactions.unshift({
                        id: txId,
                        date: new Date().toISOString().split('T')[0],
                        description: "Wallet Top Up",
                        amount: amount,
                        status: "completed",
                        type: "credit"
                    });

                    // Reload transactions
                    loadPaymentsPage();
                }
            });

            // View receipt buttons
            document.querySelectorAll('.view-receipt').forEach(btn => {
                btn.addEventListener('click', () => {
                    const txId = btn.getAttribute('data-tx');
                    alert(`Receipt for transaction ${txId} would be displayed here`);
                });
            });
        }

        // Load Profile page
        function loadProfilePage() {
            // Set form values
            document.getElementById('first-name').value = userData.firstName;
            document.getElementById('last-name').value = userData.lastName;
            document.getElementById('email').value = userData.email;
            document.getElementById('phone').value = userData.phone;
            document.getElementById('dob').value = userData.dob;
            document.getElementById('gender').value = userData.gender;
            document.getElementById('address').value = userData.address;
            document.getElementById('profile-picture').src = userData.profilePic;

            // Profile form submission
            document.getElementById('profile-form').addEventListener('submit', (e) => {
                e.preventDefault();

                // Update user data
                userData.firstName = document.getElementById('first-name').value;
                userData.lastName = document.getElementById('last-name').value;
                userData.email = document.getElementById('email').value;
                userData.phone = document.getElementById('phone').value;
                userData.dob = document.getElementById('dob').value;
                userData.gender = document.getElementById('gender').value;
                userData.address = document.getElementById('address').value;

                // Update username display
                username.textContent = `${userData.firstName} ${userData.lastName}`;

                alert('Profile updated successfully!');
            });

            // Password form submission
            document.getElementById('password-form').addEventListener('submit', (e) => {
                e.preventDefault();

                const current = document.getElementById('current-password').value;
                const newPass = document.getElementById('new-password').value;
                const confirmPass = document.getElementById('confirm-password').value;

                if (newPass !== confirmPass) {
                    alert('New passwords do not match!');
                    return;
                }

                // In a real app, this would validate current password and update on server
                alert('Password changed successfully!');
                document.getElementById('password-form').reset();
            });

            // Profile picture upload
            document.getElementById('profile-upload').addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        userData.profilePic = event.target.result;
                        document.getElementById('profile-picture').src = event.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });

            // Remove profile picture
            document.getElementById('remove-profile-pic').addEventListener('click', () => {
                userData.profilePic = "https://via.placeholder.com/150";
                document.getElementById('profile-picture').src = userData.profilePic;
            });
        }

        // Load Support page
        function loadSupportPage() {
            const ticketList = document.getElementById('ticket-list');

            // Load tickets
            ticketList.innerHTML = '';
            userData.tickets.forEach(ticket => {
                const ticketItem = document.createElement('div');
                ticketItem.className = 'border rounded p-4 hover:bg-gray-50 cursor-pointer';
                ticketItem.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-medium">${ticket.subject}</h4>
                            <p class="text-sm text-gray-600">${ticket.category.replace(/^\w/, c => c.toUpperCase())} • ${formatDate(ticket.date)}</p>
                        </div>
                        <span class="${ticket.status === 'open' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'} px-2 py-1 rounded text-xs">
                            ${ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
                        </span>
                    </div>
                    <div class="flex justify-between items-center mt-3">
                        <p class="text-sm text-gray-600">Last updated: ${formatDate(ticket.lastUpdated, true)}</p>
                        <button class="text-blue-600 text-sm view-ticket" data-ticket="${ticket.id}">
                            View Details
                        </button>
                    </div>
                `;
                ticketList.appendChild(ticketItem);
            });

            // New ticket card
            document.getElementById('new-ticket-card').addEventListener('click', () => {
                document.getElementById('ticket-list-container').classList.add('hidden');
                document.getElementById('new-ticket-container').classList.remove('hidden');
            });

            // Cancel ticket button
            document.getElementById('cancel-ticket').addEventListener('click', () => {
                document.getElementById('ticket-list-container').classList.remove('hidden');
                document.getElementById('new-ticket-container').classList.add('hidden');
            });

            // Submit ticket form
            document.getElementById('ticket-form').addEventListener('submit', (e) => {
                e.preventDefault();

                const subject = document.getElementById('ticket-subject').value;
                const category = document.getElementById('ticket-category').value;
                const description = document.getElementById('ticket-description').value;

                if (!subject || !description) {
                    alert('Please fill in all required fields');
                    return;
                }

                // Create new ticket
                const ticketId = `TCK-${Math.floor(1000 + Math.random() * 9000)}`;
                const today = new Date().toISOString().split('T')[0];

                userData.tickets.unshift({
                    id: ticketId,
                    subject: subject,
                    category: category,
                    status: "open",
                    date: today,
                    lastUpdated: today
                });

                alert(`Ticket #${ticketId} created successfully! Our support team will get back to you soon.`);
                document.getElementById('ticket-form').reset();

                // Show ticket list
                document.getElementById('ticket-list-container').classList.remove('hidden');
                document.getElementById('new-ticket-container').classList.add('hidden');

                // Reload tickets
                loadSupportPage();
            });

            // View ticket buttons
            document.querySelectorAll('.view-ticket').forEach(btn => {
                btn.addEventListener('click', () => {
                    const ticketId = btn.getAttribute('data-ticket');
                    const ticket = userData.tickets.find(t => t.id === ticketId);
                    showTicketDetails(ticket);
                });
            });

            // View open tickets
            document.getElementById('view-open-tickets').addEventListener('click', () => {
                alert('Filtered view of open tickets would be shown here');
            });

            // View FAQ
            document.getElementById('view-faq').addEventListener('click', () => {
                alert('FAQ section would be shown here');
            });
        }

        // Show ticket details
        function showTicketDetails(ticket) {
            // In a real app, this would be a proper modal
            alert(`Ticket Details:\n\nID: ${ticket.id}\nSubject: ${ticket.subject}\nCategory: ${ticket.category}\nStatus: ${ticket.status}\nDate: ${formatDate(ticket.date)}\nLast Updated: ${formatDate(ticket.lastUpdated)}`);
        }

        // Load Settings page
        function loadSettingsPage() {
            // Settings menu items
            document.querySelectorAll('.settings-menu-item').forEach(item => {
                item.addEventListener('click', () => {
                    // Remove active state from all items
                    document.querySelectorAll('.settings-menu-item').forEach(i =>
                        i.classList.remove('bg-blue-100', 'text-blue-800', 'font-medium', 'active'));

                    // Add active state to clicked item
                    item.classList.add('bg-blue-100', 'text-blue-800', 'font-medium', 'active');

                    const tab = item.getAttribute('data-tab');

                    // Hide all tabs
                    document.querySelectorAll('.settings-tab').forEach(t =>
                        t.classList.add('hidden'));

                    // Show selected tab
                    document.getElementById(`${tab}-tab`).classList.remove('hidden');
                });
            });

            // Load active sessions
            const activeSessions = document.getElementById('active-sessions');
            activeSessions.innerHTML = '';

            userData.sessions.forEach(session => {
                const sessionItem = document.createElement('div');
                sessionItem.className = 'flex justify-between items-center p-2 border rounded';
                sessionItem.innerHTML = `
                    <div>
                        <p class="font-medium">${session.device}</p>
                        <p class="text-sm text-gray-600">${session.location} • ${session.lastActive}</p>
                    </div>
                    <button class="text-red-600 text-sm" data-session="${session.id}">
                        <i class="fas fa-sign-out-alt"></i> Logout
                    </button>
                `;
                activeSessions.appendChild(sessionItem);
            });

            // Session logout buttons
            document.querySelectorAll('[data-session]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const sessionId = parseInt(btn.getAttribute('data-session'));
                    if (confirm('Logout this device?')) {
                        // In a real app, this would revoke the session
                        alert('Session revoked successfully!');
                    }
                });
            });
        }

        // Helper function to format dates
        function formatDate(dateString, includeTime = false) {
            const options = {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                ...(includeTime && { hour: '2-digit', minute: '2-digit' })
            };
            return new Date(dateString).toLocaleDateString('en-US', options);
        }

        // Helper function to get status class
        function getStatusClass(status) {
            switch (status) {
                case 'processing':
                case 'pending':
                    return 'bg-yellow-100 text-yellow-800';
                case 'completed':
                case 'delivered':
                case 'active':
                case 'resolved':
                    return 'bg-green-100 text-green-800';
                case 'cancelled':
                case 'failed':
                    return 'bg-red-100 text-red-800';
                default:
                    return 'bg-gray-100 text-gray-800';
            }
        }

        // Helper function to get next month's date
        function getNextMonthDate() {
            const date = new Date();
            date.setMonth(date.getMonth() + 1);
            return date.toISOString().split('T')[0];
        }

        // Initialize the dashboard when DOM is loaded
        document.addEventListener('DOMContentLoaded', initDashboard);

        // Simulate real-time updates (in a real app, this would be WebSocket or polling)
        setInterval(() => {
            // Randomly update order status (for demo purposes)
            const activeOrder = userData.recentOrders.find(order => order.status === 'processing');
            if (activeOrder && activeOrder.tracking) {
                if (activeOrder.tracking.progress < 100) {
                    activeOrder.tracking.progress += Math.floor(Math.random() * 10);
                    if (activeOrder.tracking.progress >= 100) {
                        activeOrder.tracking.progress = 100;
                        activeOrder.tracking.status = 'delivered';
                        activeOrder.status = 'delivered';
                        activeOrder.tracking.location = 'Delivered to customer';
                    } else if (activeOrder.tracking.progress > 80) {
                        activeOrder.tracking.status = 'in-transit-near';
                        activeOrder.tracking.location = 'Near your location';
                    }

                    // Update UI if on dashboard
                    if (!document.getElementById('dashboard-page').classList.contains('hidden')) {
                        loadDeliveryStatus();
                    }
                }
            }

            // Update notification count (for demo purposes)
            if (Math.random() > 0.7) {
                const newNotification = {
                    id: userData.notifications.length + 1,
                    title: ['System Update', 'New Feature', 'Special Offer'][Math.floor(Math.random() * 3)],
                    message: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
                    date: new Date().toISOString().split('T')[0],
                    read: false,
                    type: 'system'
                };
                userData.notifications.unshift(newNotification);
                loadNotifications();
            }
        }, 10000); // Update every 10 seconds
