import { Request, Response } from "express";
import { Op } from "sequelize";
import { User } from "../../models/User";
import { UserMysteryBox } from "../../models/UserMysteryBox";
import { Product } from "../../models/Product";

export const checkEligibility = async (req: any, res: Response) => {
	try {
		const userId = req.user?.userId;

		// Find user
		const user = await User.findByPk(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Check if current date is after September 3, 2025 (end date)
		const currentDate = new Date();
		const endDate = new Date('2025-09-03T23:59:59.999Z');
		
		if (currentDate > endDate) {
			return res.status(200).json({
				eligible: false,
				mystery_box: null,
				reason: "Mystery box program has ended"
			});
		}

		// Check if user email is in the whitelist
		let isEmailWhitelisted = false;
		try {
			const whitelistResponse = await fetch('https://gopro-lenovoid.com/data/mysterybox.json');
			if (!whitelistResponse.ok) {
				throw new Error(`Failed to fetch whitelist: ${whitelistResponse.status}`);
			}
			
			const whitelist: string[] = await whitelistResponse.json();
			isEmailWhitelisted = whitelist.includes(user.email);
		} catch (error) {
			console.error("Error fetching whitelist:", error);
			// Continue with whitelist check failed, treat as not whitelisted
			isEmailWhitelisted = false;
		}

		// If user is not whitelisted, return not eligible with consistent structure
		if (!isEmailWhitelisted) {
			return res.status(200).json({
				eligible: false,
				mystery_box: null,
				reason: "Email not in whitelist"
			});
		}

		// Check for available mystery boxes - get only the first one
		const availableMysteryBox = await UserMysteryBox.findOne({
			where: {
				user_id: userId,
				status: 'available'
			},
			include: [
				{
					model: Product,
					attributes: ['product_id', 'name', 'image_url', 'category']
				}
			],
			order: [['createdAt', 'ASC']] // Get the oldest available mystery box first
		});

		const isEligible = !!availableMysteryBox;

		res.status(200).json({
			eligible: isEligible,
			mystery_box: availableMysteryBox,
			reason: isEligible ? "User is eligible and has available mystery box" : "No available mystery box found"
		});

	} catch (error) {
		console.error("Error checking mystery box eligibility:", error);
		res.status(500).json({ message: "Something went wrong" });
	}
};

export const updateMysteryBox = async (req: any, res: Response) => {
	try {
		const userId = req.user?.userId;
		const { user_mystery_box_id, status } = req.body;

		// Validate required fields
		if (!user_mystery_box_id || !status) {
			return res.status(400).json({
				message: "id and status are required",
				status: 400
			});
		}

		// Validate status value
		if (!['available', 'claimed'].includes(status)) {
			return res.status(400).json({
				message: "Status must be either 'available' or 'claimed'",
				status: 400
			});
		}

		// Find the mystery box and verify ownership
		const mysteryBox = await UserMysteryBox.findOne({
			where: {
				user_mystery_box_id,
				user_id: userId
			}
		});

		if (!mysteryBox) {
			return res.status(404).json({
				message: "Mystery box not found or you don't have permission to update it",
				status: 404
			});
		}

		// Update the mystery box status
		await mysteryBox.update({ status });


		res.status(200).json({
			message: "Mystery box status updated successfully",
			status: 200,
		});

	} catch (error) {
		console.error("Error updating mystery box status:", error);
		res.status(500).json({ 
			message: "Something went wrong",
			status: 500
		});
	}
};

