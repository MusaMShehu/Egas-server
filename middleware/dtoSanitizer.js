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



// const customerDeliveryDTO = (delivery) => {
//   if (!delivery) return null;
//   const d = delivery.toObject ? delivery.toObject() : delivery;

//   // Whitelist of fields the customer is allowed to see
//   return {
//     _id: d._id,
//     status: d.status,
//     plantWorkflowStatus: sanitizePlantWorkflowForCustomer(d.plantWorkflowStatus),
//     deliveryDate: d.deliveryDate,
//     scheduledDate: d.scheduledDate,
//     deliveredAt: d.deliveredAt,
//     address: d.address,
//     planDetails: d.planDetails
//       ? {
//           planName: d.planDetails.planName,
//           size: d.planDetails.size,
//           frequency: d.planDetails.frequency,
//         }
//       : null,
//     // Customer can see their own cylinder tag for the current delivery
//     cylinderTag: d.cylinderTag || null,
//     // Never expose: plantId, plantRefillRequestId, plantConfirmedQuantity,
//     // measuredWeight, emptyWeight, calculatedRemnant, agentNotes, rejectedReason
//     createdAt: d.createdAt,
//     updatedAt: d.updatedAt,
//   };
// };

const customerDeliveryDTO = (delivery) => {
  if (!delivery) return null;
  const d = delivery.toObject ? delivery.toObject() : delivery;

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
    cylinderTag: d.cylinderTag || null,

    // ── NEW: Weights block (customer-visible) ──
    weights: {
      preFillWeight: d.preFillWeight ?? null,
      preFillRecordedAt: d.preFillRecordedAt ?? null,
      postFillWeight: d.postFillWeight ?? null,
      postFillRecordedAt: d.postFillRecordedAt ?? null,
      purchasedKg: d.purchasedKg ?? null,
      refilledKg: d.refilledKg ?? null,
      remnantDeltaKg: d.remnantDeltaKg ?? null,
      remnantCredited: !!d.remnantLedgerEntryId,
    },

    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
};




// Map internal plant workflow → customer-visible simplified status
const sanitizePlantWorkflowForCustomer = (internalStatus) => {
  if (!internalStatus || internalStatus === 'not_started') return null;

  // Only expose "neutral" phases that don't reveal plant operations
  // const mapping = {
  //   not_started: null,
  //   plant_selected: 'preparing',
  //   request_created: 'preparing',
  //   at_plant: 'preparing',
  //   inspection_pending: 'preparing',
  //   inspection_approved: 'preparing',
  //   inspection_rejected: 'preparing', // Customer sees "preparing" (agent handles internally)
  //   refilling: 'preparing',
  //   plant_confirmed: 'ready',
  //   cylinder_collected_from_plant: 'out_for_delivery',
  //   completed: null,
  //   escalated: null, // Customer sees existing delivery.status
  // };

  const mapping = {
  not_started: null,

  // ── Legacy plant workflow ──
  plant_selected: 'preparing',
  request_created: 'preparing',
  at_plant: 'preparing',
  inspection_pending: 'preparing',
  inspection_approved: 'preparing',
  inspection_rejected: 'preparing',
  refilling: 'preparing',
  plant_confirmed: 'ready',
  cylinder_collected_from_plant: 'out_for_delivery',
  completed: null,
  escalated: null,

  // ── New agent workflow ──
  agent_collected_from_customer: 'preparing',
  plant_inspection_passed: 'preparing',
  plant_inspection_rejected: 'preparing',
  plant_refilled_confirmed: 'ready',
  agent_collected_from_plant: 'out_for_delivery',
  remnant_credited: 'out_for_delivery',
  delivered_to_customer: null,
};

  return mapping[internalStatus] || null;
};

// ============================================================
// CUSTOMER-FACING DELIVERY TIMELINE
// ============================================================



// const customerDeliveryTimeline = (delivery) => {
//   const events = [];
//   const d = delivery.toObject ? delivery.toObject() : delivery;

//   if (d.createdAt) {
//     events.push({ step: 'order_confirmed', label: 'Order Confirmed', at: d.createdAt });
//   }
//   if (d.assignedAt) {
//     events.push({ step: 'agent_assigned', label: 'Delivery Agent Assigned', at: d.assignedAt });
//   }
//   if (d.acceptedAt) {
//     events.push({ step: 'agent_accepted', label: 'Agent Accepted', at: d.acceptedAt });
//   }
//   if (d.cylinderTag && d.plantWorkflowStatus && d.plantWorkflowStatus !== 'not_started') {
//     events.push({
//       step: 'cylinder_collected',
//       label: 'Cylinder Collected',
//       at: d.updatedAt || d.deliveryDate,
//     });
//   }
//   if (d.status === 'out_for_delivery' || d.plantWorkflowStatus === 'cylinder_collected_from_plant') {
//     events.push({
//       step: 'out_for_delivery',
//       label: 'Out for Delivery',
//       at: d.updatedAt,
//     });
//   }
//   if (d.status === 'delivered' || d.deliveredAt) {
//     events.push({
//       step: 'delivered',
//       label: 'Delivered',
//       at: d.deliveredAt || d.updatedAt,
//     });
//   }
//   if (d.status === 'failed') {
//     events.push({ step: 'failed', label: 'Delivery Failed', at: d.failedAt });
//   }

//   return events.sort((a, b) => new Date(a.at) - new Date(b.at));
// };



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

  // ── NEW: Pre-fill weighing ──
  if (d.preFillRecordedAt && d.preFillWeight != null) {
    events.push({
      step: 'pre_fill_recorded',
      label: `Cylinder weighed before refill (${d.preFillWeight.toFixed(2)} kg)`,
      at: d.preFillRecordedAt,
    });
  }

  if (d.cylinderTag && d.plantWorkflowStatus && d.plantWorkflowStatus !== 'not_started') {
    events.push({
      step: 'cylinder_collected',
      label: 'Cylinder Collected',
      at: d.updatedAt || d.deliveryDate,
    });
  }
  if (d.status === 'out_for_delivery' || d.plantWorkflowStatus === 'cylinder_collected_from_plant' || d.plantWorkflowStatus === 'agent_collected_from_plant') {
    events.push({
      step: 'out_for_delivery',
      label: 'Out for Delivery',
      at: d.updatedAt,
    });
  }

  // ── NEW: Post-fill weighing ──
  if (d.postFillRecordedAt && d.postFillWeight != null) {
    events.push({
      step: 'post_fill_recorded',
      label: `Cylinder weighed after refill (${d.postFillWeight.toFixed(2)} kg)`,
      at: d.postFillRecordedAt,
    });
  }

  // ── NEW: Remnant credited ──
  if (d.remnantLedgerEntryId && d.remnantDeltaKg != null && d.remnantDeltaKg > 0) {
    events.push({
      step: 'remnant_credited',
      label: `${d.remnantDeltaKg.toFixed(2)} kg added to remnant balance`,
      at: d.postFillRecordedAt || d.updatedAt,
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



// const customerRemnantLedgerDTO = (entry) => {
//   if (!entry) return null;
//   const e = entry.toObject ? entry.toObject() : entry;

//   return {
//     _id: e._id,
//     event: e.event,
//     delta: e.delta,
//     newBalance: e.newBalance,
//     measuredWeight: e.measuredWeight,
//     emptyWeight: e.emptyWeight,
//     physicalRemnant: e.physicalRemnant,
//     cylinderTag: e.cylinderTag,
//     createdAt: e.createdAt,
//     // Never expose: performedBy (internal), reason (internal), metadata,
//     // deliveryId, plantRefillRequestId
//   };
// };


const customerRemnantLedgerDTO = (entry) => {
  if (!entry) return null;
  const e = entry.toObject ? entry.toObject() : entry;

  // Delivery badge: "Delivery #A3F2C1 • 15 Oct 2026"
  let deliveryBadge = null;
  if (e.deliveryId) {
    const shortId = String(e.deliveryId._id || e.deliveryId)
      .slice(-6)
      .toUpperCase();
    const dt = new Date(e.createdAt);
    const dateLabel = dt.toLocaleDateString('en-NG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    deliveryBadge = `Delivery #${shortId} • ${dateLabel}`;
  }

  return {
    _id: e._id,
    event: e.event,
    delta: e.delta,
    newBalance: e.newBalance,
    measuredWeight: e.measuredWeight,
    emptyWeight: e.emptyWeight,
    physicalRemnant: e.physicalRemnant,
    cylinderTag: e.cylinderTag,

    // ── NEW: pre/post fill and purchase context ──
    preFillWeight: e.preFillWeight ?? null,
    postFillWeight: e.postFillWeight ?? null,
    purchasedKg: e.purchasedKg ?? null,
    refilledKg: e.refilledKg ?? null,
    delivery: deliveryBadge
      ? {
          _id: e.deliveryId._id || e.deliveryId,
          badge: deliveryBadge,
        }
      : null,

    createdAt: e.createdAt,
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