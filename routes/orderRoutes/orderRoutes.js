import express from 'express';
import OrderModel from '../../models/orders.js';
import { isUserAuthorized } from '../../utils/authUtils.js';

const router = express.Router();

router.post('/order', isUserAuthorized, async (req, res) => {
  try {
    const { artName, deliveryDetails } = req.body;

    // Validate input
    if (!artName || !deliveryDetails) {
      return res.status(400).json({
        success: false,
        error: 'Art name and delivery details are required.',
      });
    }

    // Create the order
    const newOrder = new OrderModel({
      artName,
      userAccountName: req.user.name, // Extract account name from req.user
      userId: req.user._id, // Extract user ID from req.user
      deliveryDetails,
    });

    await newOrder.save();

    res.status(201).json({
      success: true,
      message: 'Order created successfully.',
      order: newOrder,
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
    });
  }
});


export default router;
