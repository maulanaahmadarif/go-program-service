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

export const getMysteryBoxList = async (req: any, res: Response) => {
	try {
		const { page = 1, limit = 10, status, start_date, end_date } = req.query;

		// Validate page and limit
		const pageNum = parseInt(page as string, 10);
		const limitNum = parseInt(limit as string, 10);

		if (isNaN(pageNum) || pageNum < 1) {
			return res.status(400).json({
				message: "Page must be a positive integer",
				status: 400
			});
		}

		if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
			return res.status(400).json({
				message: "Limit must be a positive integer between 1 and 100",
				status: 400
			});
		}

		// Validate status if provided
		if (status && !['available', 'claimed'].includes(status as string)) {
			return res.status(400).json({
				message: "Status must be either 'available' or 'claimed'",
				status: 400
			});
		}

		// Validate date parameters if provided
		let startDate: Date | undefined;
		let endDate: Date | undefined;

		if (start_date) {
			startDate = new Date(start_date as string);
			if (isNaN(startDate.getTime())) {
				return res.status(400).json({
					message: "Invalid start_date format. Use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)",
					status: 400
				});
			}
		}

		if (end_date) {
			endDate = new Date(end_date as string);
			if (isNaN(endDate.getTime())) {
				return res.status(400).json({
					message: "Invalid end_date format. Use ISO date format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.sssZ)",
					status: 400
				});
			}
		}

		// Validate that start_date is before end_date if both are provided
		if (startDate && endDate && startDate > endDate) {
			return res.status(400).json({
				message: "start_date must be before or equal to end_date",
				status: 400
			});
		}

		// Build where clause
		const whereClause: any = {};

		if (status) {
			whereClause.status = status;
		}

		// Add date range filtering
		if (startDate || endDate) {
			whereClause.createdAt = {};
			
			if (startDate) {
				whereClause.createdAt[Op.gte] = startDate;
			}
			
			if (endDate) {
				// Set end date to end of day if only date is provided (no time)
				const endOfDay = new Date(endDate);
				if (endDate.getHours() === 0 && endDate.getMinutes() === 0 && endDate.getSeconds() === 0) {
					endOfDay.setHours(23, 59, 59, 999);
				}
				whereClause.createdAt[Op.lte] = endOfDay;
			}
		}

		// Calculate offset
		const offset = (pageNum - 1) * limitNum;

		// Get mystery boxes with pagination
		const { count, rows: mysteryBoxes } = await UserMysteryBox.findAndCountAll({
			where: whereClause,
			include: [
				{
					model: Product,
					attributes: ['product_id', 'name', 'image_url', 'category']
				},
				{
					model: User,
					attributes: ['username', 'email']
				}
			],
			limit: limitNum,
			offset: offset,
			order: [['createdAt', 'DESC']]
		});

		// Calculate pagination info
		const totalPages = Math.ceil(count / limitNum);
		const hasNextPage = pageNum < totalPages;
		const hasPrevPage = pageNum > 1;

		res.status(200).json({
			message: "Mystery boxes retrieved successfully",
			data: mysteryBoxes,
			pagination: {
				current_page: pageNum,
				total_pages: totalPages,
				total_items: count,
				items_per_page: limitNum,
				has_next_page: hasNextPage,
				has_prev_page: hasPrevPage
			},
			status: 200
		});

	} catch (error) {
		console.error("Error getting mystery box list:", error);
		res.status(500).json({
			message: "Something went wrong",
			status: 500
		});
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

