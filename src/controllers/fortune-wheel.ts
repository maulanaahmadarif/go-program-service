import { Request, Response } from "express";
import { Op } from "sequelize";
import { sequelize } from "../db";
import { User } from "../../models/User";
import { Product } from "../../models/Product";
import { FortuneWheelSpin } from "../../models/FortuneWheelSpin";

export const checkEligibility = async (req: any, res: Response) => {
	try {
		const userId = req.user?.userId;

		// Find user
		const user = await User.findByPk(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Check total spins
		const spinCount = await FortuneWheelSpin.count({
			where: {
				user_id: userId
			}
		});

		const MAX_SPINS = 2;
		const isEligible = spinCount < MAX_SPINS;
		const spinsRemaining = Math.max(0, MAX_SPINS - spinCount);

		res.status(200).json({
			eligible: isEligible,
			spins_remaining: spinsRemaining
		});

	} catch (error) {
		console.error("Error checking fortune wheel eligibility:", error);
		res.status(500).json({ message: "Something went wrong" });
	}
};

export const spinWheel = async (req: any, res: Response) => {
	const transaction = await sequelize.transaction();
	try {
		const userId = req.user?.userId;
		const { product_id, prize_name, is_redeemed = false } = req.body;

		if (!prize_name) {
			await transaction.rollback();
			return res.status(400).json({ message: "Prize name is required" });
		}

		// Find user
		const user = await User.findByPk(userId, { transaction });
		if (!user) {
			await transaction.rollback();
			return res.status(404).json({ message: "User not found" });
		}

		// Check total spins limit
		const spinCount = await FortuneWheelSpin.count({
			where: {
				user_id: userId
			},
			transaction
		});

		const MAX_SPINS = 2;
		if (spinCount >= MAX_SPINS) {
			await transaction.rollback();
			return res.status(400).json({ 
				message: "Maximum spin limit reached",
				spins_remaining: 0
			});
		}

		let product = null;
		// Validate product exists and has stock only if product_id is provided
		if (product_id) {
			product = await Product.findByPk(product_id, { transaction });
			if (!product || product.stock_quantity <= 0) {
				await transaction.rollback();
				return res.status(400).json({ message: "Invalid or out of stock product" });
			}
		}

		// Create spin record
		const spin = await FortuneWheelSpin.create({
			user_id: userId,
			product_id: product_id || null,
			prize_name,
			status: 'COMPLETED',
			is_redeemed
		}, { transaction });

		await transaction.commit();

		// Return the result
		res.status(200).json({
			message: "Fortune wheel spin successful",
			spins_remaining: MAX_SPINS - (spinCount + 1),
			spin_result: {
				spin_id: spin.spin_id,
				product_id: spin.product_id,
				product_name: product?.name,
				prize_name: spin.prize_name,
				points_required: product?.points_required,
				is_redeemed,
				timestamp: spin.createdAt
			}
		});

	} catch (error) {
		await transaction.rollback();
		console.error("Error in fortune wheel spin:", error);
		res.status(500).json({ message: "Something went wrong" });
	}
}; 