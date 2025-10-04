// Staff Dashboard Specific Functions
function updateOrderStatus(orderId, status) {
  putData(`/api/staff/orders/${orderId}/status`, { status })
    .then(data => {
      showAlert('success', 'Order status updated successfully');
      loadStaffDashboard();
    })
    .catch(error => {
      showAlert('error', 'Failed to update order status');
      console.error(error);
    });
}

function reportIssue(orderId) {
  const issueDescription = prompt('Please describe the issue:');
  if (issueDescription) {
    putData(`/api/staff/orders/${orderId}/status`, { 
      status: 'issue-reported',
      notes: issueDescription
    })
    .then(data => {
      showAlert('success', 'Issue reported successfully');
      loadStaffDashboard();
    })
    .catch(error => {
      showAlert('error', 'Failed to report issue');
      console.error(error);
    });
  }
}

function respondToTicket(ticketId) {
  const response = prompt('Enter your response:');
  if (response) {
    putData(`/api/staff/tickets/${ticketId}`, { response })
      .then(data => {
        showAlert('success', 'Response submitted');
        loadStaffDashboard();
      })
      .catch(error => {
        showAlert('error', 'Failed to submit response');
        console.error(error);
      });
  }
}

function escalateTicket(ticketId) {
  if (confirm('Are you sure you want to escalate this ticket?')) {
    putData(`/api/staff/tickets/${ticketId}`, { escalate: true })
      .then(data => {
        showAlert('success', 'Ticket escalated');
        loadStaffDashboard();
      })
      .catch(error => {
        showAlert('error', 'Failed to escalate ticket');
        console.error(error);
      });
  }
}