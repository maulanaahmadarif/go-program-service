import { Request, Response } from "express";
import { Op } from "sequelize";
import dayjs from "dayjs";
import ExcelJS from "exceljs";
import { sequelize } from "../db";
import { User } from "../../models/User";
import { Product } from "../../models/Product";
import { Company } from "../../models/Company";
import { FortuneWheelSpin } from "../../models/FortuneWheelSpin";
import { getUserType } from "../utils";

export const checkEligibility = async (req: any, res: Response) => {
	try {
		const userId = req.user?.userId;

		// Find user
		const user = await User.findByPk(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		// Check total spins since August 20, 2025
		const spinCount = await FortuneWheelSpin.count({
			where: {
				user_id: userId,
				createdAt: {
					[Op.gte]: new Date('2025-10-25T00:00:00.000Z')
				}
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

		// Check total spins limit since August 20, 2025
		const spinCount = await FortuneWheelSpin.count({
			where: {
				user_id: userId,
				createdAt: {
					[Op.gte]: new Date('2025-10-25T00:00:00.000Z')
				}
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

export const getFortuneWheelList = async (req: Request, res: Response) => {
	try {
		const { user_id, start_date, end_date, status } = req.query;
		const page = parseInt(req.query.page as string) || 1;
		const limit = parseInt(req.query.limit as string) || 10;
		const offset = (page - 1) * limit;

		const whereClause: any = {
			product_id: {
				[Op.ne]: null
			}
		};

		// Add user_id filter
		if (user_id) {
			whereClause.user_id = user_id;
		}

		// Add status filter
		if (status) {
			if (Array.isArray(status)) {
				whereClause.status = {
					[Op.in]: status
				};
			} else {
				whereClause.status = status;
			}
		}

		// Add date range filters
		if (start_date) {
			whereClause.createdAt = {
				...(whereClause.createdAt || {}),
				[Op.gte]: new Date(start_date as any),
			};
		}

		if (end_date) {
			whereClause.createdAt = {
				...(whereClause.createdAt || {}),
				[Op.lte]: new Date(end_date as any),
			};
		}

		// Get total count for pagination
		const totalCount = await FortuneWheelSpin.count({
			where: whereClause
		});
		const totalPages = Math.ceil(totalCount / limit);

		// Get fortune wheel spins with user and product data
		const spins = await FortuneWheelSpin.findAll({
			where: whereClause,
			include: [
				{
					model: User,
					attributes: ['user_id', 'username', 'fullname', 'email', 'user_type', 'company_id', 'phone_number']
				},
				{
					model: Product,
					attributes: ['product_id', 'name', 'points_required', 'stock_quantity', 'image_url'],
					required: false // LEFT JOIN so we get spins even if product is null
				}
			],
			order: [['createdAt', 'DESC']],
			limit,
			offset
		});

		// Transform the response
		const transformedSpins = spins.map(spin => {
			const plainSpin = spin.get({ plain: true }) as any;
			return {
				spin_id: plainSpin.spin_id,
				user: {
					user_id: plainSpin.user.user_id,
					username: plainSpin.user.username,
					fullname: plainSpin.user.fullname,
					email: plainSpin.user.email,
					user_type: plainSpin.user.user_type,
					company_id: plainSpin.user.company_id,
					phone_number: plainSpin.user.phone_number
				},
				product: plainSpin.product ? {
					product_id: plainSpin.product.product_id,
					name: plainSpin.product.name,
					points_required: plainSpin.product.points_required,
					stock_quantity: plainSpin.product.stock_quantity,
					image_url: plainSpin.product.image_url
				} : null,
				prize_name: plainSpin.prize_name,
				status: plainSpin.status,
				is_redeemed: plainSpin.is_redeemed,
				created_at: dayjs(plainSpin.createdAt).format('DD MMM YYYY HH:mm'),
				updated_at: dayjs(plainSpin.updatedAt).format('DD MMM YYYY HH:mm')
			};
		});

		res.status(200).json({
			message: 'List of fortune wheel spins',
			status: res.status,
			data: transformedSpins,
			pagination: {
				total_items: totalCount,
				total_pages: totalPages,
				current_page: page,
				items_per_page: limit,
				has_next: page < totalPages,
				has_previous: page > 1
			}
		});

	} catch (error: any) {
		console.error('Error fetching fortune wheel list:', error);

		// Handle validation errors from Sequelize
		if (error.name === 'SequelizeValidationError') {
			const messages = error.errors.map((err: any) => err.message);
			return res.status(400).json({ message: 'Validation error', errors: messages });
		}

		res.status(500).json({ message: 'Something went wrong', error });
	}
};

export const downloadFortuneWheelList = async (req: Request, res: Response) => {
	try {
		const { user_id, start_date, end_date, status } = req.query;
		const userWhere: any = {};

		// Add user_id filter
		if (user_id) {
			userWhere.user_id = user_id;
		}

		const whereClause: any = {
			product_id: {
				[Op.ne]: null
			}
		};

		// Add status filter
		if (status) {
			if (Array.isArray(status)) {
				whereClause.status = {
					[Op.in]: status
				};
			} else {
				whereClause.status = status;
			}
		}

		// Add date range filters
		if (start_date) {
			whereClause.createdAt = {
				...(whereClause.createdAt || {}),
				[Op.gte]: new Date(start_date as any),
			};
		}

		if (end_date) {
			whereClause.createdAt = {
				...(whereClause.createdAt || {}),
				[Op.lte]: new Date(end_date as any),
			};
		}

		// Get fortune wheel spins with user, company, and product data
		const spins = await FortuneWheelSpin.findAll({
			where: whereClause,
			include: [
				{
					model: User,
					attributes: ['user_id', 'username', 'fullname', 'email', 'user_type', 'company_id', 'phone_number'],
					required: true,
					where: userWhere,
					include: [
						{
							model: Company,
							attributes: ['name'],
							required: false
						}
					]
				},
				{
					model: Product,
					attributes: ['product_id', 'name', 'points_required', 'stock_quantity', 'image_url'],
					required: false
				}
			],
			order: [['createdAt', 'DESC']]
		});

		const workbook = new ExcelJS.Workbook();
		const worksheet = workbook.addWorksheet('fortune_wheel_spins');

		worksheet.columns = [
			{ header: 'No', key: 'no', width: 5 },
			{ header: 'Company', key: 'company', width: 20 },
			{ header: 'Username', key: 'username', width: 15 },
			{ header: 'Fullname', key: 'fullname', width: 20 },
			{ header: 'Email', key: 'email', width: 25 },
			{ header: 'Phone Number', key: 'phone_number', width: 15 },
			{ header: 'User Type', key: 'user_type', width: 12 },
			{ header: 'Prize Name', key: 'prize_name', width: 25 },
			{ header: 'Product Name', key: 'product_name', width: 25 },
			{ header: 'Points Required', key: 'points_required', width: 15 },
			{ header: 'Status', key: 'status', width: 12 },
			{ header: 'Is Redeemed', key: 'is_redeemed', width: 12 },
			{ header: 'Created At', key: 'created_at', width: 18 },
			{ header: 'Updated At', key: 'updated_at', width: 18 }
		];

		// Add data to the worksheet
		spins.forEach((spin, index) => {
			const plainSpin = spin.get({ plain: true }) as any;
			worksheet.addRow({
				no: index + 1,
				company: plainSpin.user?.company?.name || '-',
				username: plainSpin.user?.username || '-',
				fullname: plainSpin.user?.fullname || '-',
				email: plainSpin.user?.email || '-',
				phone_number: plainSpin.user?.phone_number || '-',
				user_type: plainSpin.user?.user_type ? getUserType(plainSpin.user.user_type) : '-',
				prize_name: plainSpin.prize_name || '-',
				product_name: plainSpin.product?.name || '-',
				points_required: plainSpin.product?.points_required || '-',
				status: plainSpin.status || '-',
				is_redeemed: plainSpin.is_redeemed ? 'Yes' : 'No',
				created_at: dayjs(plainSpin.createdAt).format('DD MMM YYYY HH:mm'),
				updated_at: dayjs(plainSpin.updatedAt).format('DD MMM YYYY HH:mm')
			});
		});

		// Set response headers for downloading the file
		res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		res.setHeader('Content-Disposition', 'attachment; filename=fortune_wheel_spins.xlsx');

		// Write the Excel file to the response
		await workbook.xlsx.write(res);

		// End the response
		res.end();

	} catch (error: any) {
		console.error('Error downloading fortune wheel list:', error);

		// Handle validation errors from Sequelize
		if (error.name === 'SequelizeValidationError') {
			const messages = error.errors.map((err: any) => err.message);
			return res.status(400).json({ message: 'Validation error', errors: messages });
		}

		// Handle other types of errors
		res.status(500).json({ message: 'Something went wrong', error });
	}
};