/**
 * dtoSanitizer — Whiten-list based response shaping for customer-facing APIs.
 *
 * Guarantees:
 *  - Customer NEVER sees plant identity, plant quantities, settlement, or internal ops.
 *  - Customer sees only the simplified delivery timeline + their own cylinder/remnant data.
 *
 * Usage:
 *   res.json(sanitizeCustomerDelivery(delivery));
 */

// ============================================================
// CUSTOMER-FACING DELIVERY SHAPE
// ============================================================
const customerDeliveryDTO = (delivery) => {
  if (!delivery) return null;
  const d = delivery.toObject ? delivery.toObject() : delivery;

  // Whitelist of fields the customer is allowed to see
  return {
    _id: d._id,
    status: d.status,
    plantWorkflowStatus: sanitizePlantWorkflowForCustomer(d.plantWorkflowStatus),
    deliveryDate: d.deliveryDate,
    scheduledDate: d.scheduledDate,
    deliveredAt: d.deliveredAt,
    address: d.address,
    planDetails: d.planDetails
      ? {
          planName: d.planDetails.planName,
          size: d.planDetails.size,
          frequency: d.planDetails.frequency,
        }
      : null,
    // Customer can see their own cylinder tag for the current delivery
    cylinderTag: d.cylinderTag || null,
    // Never expose: plantId, plantRefillRequestId, plantConfirmedQuantity,
    // measuredWeight, emptyWeight, calculatedRemnant, agentNotes, rejectedReason
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
};

// Map internal plant workflow → customer-visible simplified status
const sanitizePlantWorkflowForCustomer = (internalStatus) => {
  if (!internalStatus || internalStatus === 'not_started') return null;

  // Only expose "neutral" phases that don't reveal plant operations
  const mapping = {
    not_started: null,
    plant_selected: 'preparing',
    request_created: 'preparing',
    at_plant: 'preparing',
    inspection_pending: 'preparing',
    inspection_approved: 'preparing',
    inspection_rejected: 'preparing', // Customer sees "preparing" (agent handles internally)
    refilling: 'preparing',
    plant_confirmed: 'ready',
    cylinder_collected_from_plant: 'out_for_delivery',
    completed: null,
    escalated: null, // Customer sees existing delivery.status
  };

  return mapping[internalStatus] || null;
};

// ============================================================
// CUSTOMER-FACING DELIVERY TIMELINE
// ============================================================
const customerDeliveryTimeline = (delivery) => {
  const events = [];
  const d = delivery.toObject ? delivery.toObject() : delivery;

  if (d.createdAt) {
    events.push({ step: 'order_confirmed', label: 'Order Confirmed', at: d.createdAt });
  }
  if (d.assignedAt) {
    events.push({ step: 'agent_assigned', label: 'Delivery Agent Assigned', at: d.assignedAt });
  }
  if (d.acceptedAt) {
    events.push({ step: 'agent_accepted', label: 'Agent Accepted', at: d.acceptedAt });
  }
  if (d.cylinderTag && d.plantWorkflowStatus && d.plantWorkflowStatus !== 'not_started') {
    events.push({
      step: 'cylinder_collected',
      label: 'Cylinder Collected',
      at: d.updatedAt || d.deliveryDate,
    });
  }
  if (d.status === 'out_for_delivery' || d.plantWorkflowStatus === 'cylinder_collected_from_plant') {
    events.push({
      step: 'out_for_delivery',
      label: 'Out for Delivery',
      at: d.updatedAt,
    });
  }
  if (d.status === 'delivered' || d.deliveredAt) {
    events.push({
      step: 'delivered',
      label: 'Delivered',
      at: d.deliveredAt || d.updatedAt,
    });
  }
  if (d.status === 'failed') {
    events.push({ step: 'failed', label: 'Delivery Failed', at: d.failedAt });
  }

  return events.sort((a, b) => new Date(a.at) - new Date(b.at));
};

// ============================================================
// CUSTOMER-FACING CYLINDER SHAPE
// ============================================================
const customerCylinderDTO = (cylinder) => {
  if (!cylinder) return null;
  const c = cylinder.toObject ? cylinder.toObject() : cylinder;

  return {
    _id: c._id,
    tagCode: c.tagCode,
    size: c.size,
    brand: c.brand,
    emptyWeight: c.emptyWeight,
    lastMeasuredWeight: c.lastMeasuredWeight,
    lastMeasuredAt: c.lastMeasuredAt,
    status: c.status,
    // Never expose: currentCustodian.referenceId (internal), flaggedReason,
    // lastInspection.inspectionId, internal history arrays
    createdAt: c.createdAt,
  };
};

// ============================================================
// CUSTOMER-FACING REMNANT LEDGER ENTRY
// ============================================================
const customerRemnantLedgerDTO = (entry) => {
  if (!entry) return null;
  const e = entry.toObject ? entry.toObject() : entry;

  return {
    _id: e._id,
    event: e.event,
    delta: e.delta,
    newBalance: e.newBalance,
    measuredWeight: e.measuredWeight,
    emptyWeight: e.emptyWeight,
    physicalRemnant: e.physicalRemnant,
    cylinderTag: e.cylinderTag,
    createdAt: e.createdAt,
    // Never expose: performedBy (internal), reason (internal), metadata,
    // deliveryId, plantRefillRequestId
  };
};

// ============================================================
// CUSTOMER-FACING REMNANT SUMMARY
// ============================================================
const customerRemnantSummary = ({ balance, minimumRequired, eligible }) => ({
  balance,
  minimumRequired,
  eligible,
  shortfall: balance < minimumRequired ? +(minimumRequired - balance).toFixed(2) : 0,
});

// ============================================================
// CUSTOMER-FACING ORDER/DELIVERY LIST ITEM
// ============================================================
const customerDeliveryListItemDTO = (delivery) => {
  if (!delivery) return null;
  const d = delivery.toObject ? delivery.toObject() : delivery;

  return {
    _id: d._id,
    status: d.status,
    deliveryDate: d.deliveryDate,
    address: d.address,
    planName: d.planDetails?.planName || null,
    size: d.planDetails?.size || null,
    cylinderTag: d.cylinderTag || null,
    createdAt: d.createdAt,
  };
};

module.exports = {
  customerDeliveryDTO,
  customerDeliveryTimeline,
  customerCylinderDTO,
  customerRemnantLedgerDTO,
  customerRemnantSummary,
  customerDeliveryListItemDTO,
  sanitizePlantWorkflowForCustomer,
};