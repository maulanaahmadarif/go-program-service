import { Response } from "express";
import { Op } from "sequelize";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import ExcelJS from "exceljs";
import { sequelize } from "../db";
import { User } from "../../models/User";
import { Product } from "../../models/Product";
import { Company } from "../../models/Company";
import { FortuneWheelSpin } from "../../models/FortuneWheelSpin";
import { PointTransaction } from "../../models/PointTransaction";
import { Redemption } from "../../models/Redemption";
import { UserAction } from "../../models/UserAction";
import { getUserType } from "../utils";
import { CustomRequest } from "../types/api";
import { getProductFlowAvailableStock, getStockAllocationAvailability } from "../services/productStockAllocation";

dayjs.extend(utc);
dayjs.extend(timezone);

const SPIN_START_TZ = "Asia/Jakarta";
/** Spins on or after this instant count toward MAX_SPINS (start of 2026-05-13 in Jakarta / WIB). */
const SPIN_START_DATE = dayjs.tz("2026-05-13 00:00:00", SPIN_START_TZ).toDate();
const MAX_SPINS = 2;
const WHEEL_PRODUCT_ID = 28;

type WheelPrizeType = 'try_again' | 'points' | 'product';

type WheelSegment = {
	code: string;
	option: string;
	type: WheelPrizeType;
	product_id: number | null;
	product_name?: string;
	points_reward: number;
};

const TRY_AGAIN_SEGMENT: WheelSegment = {
	code: 'TRY_AGAIN',
	option: 'Try Again',
	type: 'try_again',
	product_id: null,
	points_reward: 0
};

const POINTS_SEGMENT: WheelSegment = {
	code: 'POINTS_100',
	option: 'Additional 100 Points',
	type: 'points',
	product_id: null,
	points_reward: 100
};

const WHEEL_PATTERN: WheelPrizeType[] = [
	'try_again',
	'product',
	'try_again',
	'points',
	'try_again',
	'points',
	'product',
	'points',
	'try_again',
	'points'
];

const getSpinCount = (userId: number, transaction?: any) =>
	FortuneWheelSpin.count({
		where: {
			user_id: userId,
			createdAt: {
				[Op.gte]: SPIN_START_DATE
			}
		},
		transaction
	});

const getWheelProducts = async (transaction?: any) => {
	const product = await Product.findByPk(WHEEL_PRODUCT_ID, {
		transaction,
		lock: transaction ? transaction.LOCK.UPDATE : undefined
	});

	if (!product) return [];

	if (transaction) {
		const stock = await getStockAllocationAvailability(product.product_id, 'spin_wheel', transaction);
		if (stock.allocation) {
			return stock.availableStock > 0 ? [product] : [];
		}

		return !stock.hasAnyAllocation && (product.stock_quantity || 0) > 0 ? [product] : [];
	}

	const spinWheelAvailableStock = await getProductFlowAvailableStock(product.product_id, 'spin_wheel');
	if (spinWheelAvailableStock !== null) {
		return spinWheelAvailableStock > 0 ? [product] : [];
	}

	return (product.stock_quantity || 0) > 0 ? [product] : [];
};

const buildWheelSegments = (products: Product[]): WheelSegment[] => {
	const productSegments = products.map((product) => ({
		code: `PRODUCT_${product.product_id}`,
		option: product.name,
		type: 'product' as WheelPrizeType,
		product_id: product.product_id,
		product_name: product.name,
		points_reward: 0
	}));

	return WHEEL_PATTERN.map((type, index) => {
		if (type === 'product') {
			if (productSegments.length === 0) {
				return {
					...POINTS_SEGMENT,
					code: `${POINTS_SEGMENT.code}_${index}`,
				};
			}

			const productSegment = productSegments[0];
			return {
				...productSegment,
				code: `${productSegment.code}_${index}`,
			};
		}

		if (type === 'points') {
			return {
				...POINTS_SEGMENT,
				code: `${POINTS_SEGMENT.code}_${index}`,
			};
		}

		return {
			...TRY_AGAIN_SEGMENT,
			code: `${TRY_AGAIN_SEGMENT.code}_${index}`,
		};
	});
};

export const checkEligibility = async (req: CustomRequest, res: Response) => {
	try {
		const userId = req.user?.userId;

		// Find user
		const user = await User.findByPk(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const spinCount = await getSpinCount(userId as number);
		const isEligible = spinCount < MAX_SPINS;
		const spinsRemaining = Math.max(0, MAX_SPINS - spinCount);

		res.status(200).json({
			eligible: isEligible,
			spins_remaining: spinsRemaining
		});

	} catch (error: any) {
		req.log.error({ error, stack: error.stack }, "Error checking fortune wheel eligibility");
		res.status(500).json({ message: "Something went wrong" });
	}
};

export const getFortuneWheelConfig = async (req: CustomRequest, res: Response) => {
	try {
		const userId = req.user?.userId;
		if (!userId) {
			return res.status(401).json({ message: "Unauthorized" });
		}

		const user = await User.findByPk(userId);
		if (!user) {
			return res.status(404).json({ message: "User not found" });
		}

		const [spinCount, products] = await Promise.all([
			getSpinCount(userId),
			getWheelProducts()
		]);

		const spinsRemaining = Math.max(0, MAX_SPINS - spinCount);

		res.status(200).json({
			eligible: spinCount < MAX_SPINS,
			spins_remaining: spinsRemaining,
			segments: buildWheelSegments(products)
		});
	} catch (error: any) {
		req.log.error({ error, stack: error.stack }, "Error getting fortune wheel config");
		res.status(500).json({ message: "Something went wrong" });
	}
};

export const spinWheel = async (req: CustomRequest, res: Response) => {
	const transaction = await sequelize.transaction();
	try {
		const userId = req.user?.userId;
		if (!userId) {
			await transaction.rollback();
			return res.status(401).json({ message: "Unauthorized" });
		}

		// Find user
		const user = await User.findByPk(userId, { transaction });
		if (!user) {
			await transaction.rollback();
			return res.status(404).json({ message: "User not found" });
		}

		const spinCount = await getSpinCount(userId, transaction);
		if (spinCount >= MAX_SPINS) {
			await transaction.rollback();
			return res.status(400).json({ 
				message: "Maximum spin limit reached",
				spins_remaining: 0
			});
		}

		const products = await getWheelProducts(transaction);
		const segments = buildWheelSegments(products);
		const resultIndex = Math.floor(Math.random() * segments.length);
		const selectedSegment = segments[resultIndex];
		const isRedeemed = selectedSegment.type !== 'product';

		let product: Product | null = null;
		let stockAllocation: Awaited<ReturnType<typeof getStockAllocationAvailability>> | null = null;
		if (selectedSegment.product_id) {
			product = products.find((item) => item.product_id === selectedSegment.product_id) || null;

			if (!product) {
				await transaction.rollback();
				return res.status(400).json({ message: "Invalid or out of stock product" });
			}

			stockAllocation = await getStockAllocationAvailability(product.product_id, 'spin_wheel', transaction);
			if (stockAllocation.allocation && stockAllocation.availableStock <= 0) {
				await transaction.rollback();
				return res.status(400).json({ message: "Product is out of stock for Spin Wheel" });
			}

			if (!stockAllocation.allocation && stockAllocation.hasAnyAllocation) {
				await transaction.rollback();
				return res.status(400).json({ message: "Product is not allocated for Spin Wheel" });
			}

			if (!stockAllocation.allocation && (product.stock_quantity || 0) <= 0) {
				await transaction.rollback();
				return res.status(400).json({ message: "Invalid or out of stock product" });
			}

			if (stockAllocation.allocation) {
				stockAllocation.allocation.reserved_stock = (stockAllocation.allocation.reserved_stock || 0) + 1;
				await stockAllocation.allocation.save({ transaction });
			} else {
				product.stock_quantity = (product.stock_quantity || 0) - 1;
				await product.save({ transaction });
			}
		}

		if (selectedSegment.type === 'points' && selectedSegment.points_reward > 0) {
			user.total_points = (user.total_points || 0) + selectedSegment.points_reward;
			user.accomplishment_total_points = (user.accomplishment_total_points || 0) + selectedSegment.points_reward;
			user.lifetime_total_points = (user.lifetime_total_points || 0) + selectedSegment.points_reward;
			await user.save({ transaction });

			await PointTransaction.create({
				user_id: userId,
				points: selectedSegment.points_reward,
				transaction_type: 'earn',
				description: `Earned ${selectedSegment.points_reward} points from Fortune Wheel`
			}, { transaction });
		}

		// Create spin record
		const spin = await FortuneWheelSpin.create({
			user_id: userId,
			product_id: selectedSegment.product_id,
			prize_name: selectedSegment.option,
			status: 'COMPLETED',
			is_redeemed: isRedeemed
		}, { transaction });

		await transaction.commit();

		// Return the result
		res.status(200).json({
			message: "Fortune wheel spin successful",
			spins_remaining: MAX_SPINS - (spinCount + 1),
			result_index: resultIndex,
			segments,
			spin_result: {
				spin_id: spin.spin_id,
				product_id: spin.product_id,
				product_name: product?.name,
				prize_name: spin.prize_name,
				points_required: product?.points_required,
				points_reward: selectedSegment.points_reward,
				type: selectedSegment.type,
				code: selectedSegment.code,
				is_redeemed: isRedeemed,
				requires_redeem_form: selectedSegment.type === 'product',
				timestamp: spin.createdAt
			}
		});

	} catch (error: any) {
		await transaction.rollback();
		req.log.error({ error, stack: error.stack }, "Error in fortune wheel spin");
		res.status(500).json({ message: "Something went wrong" });
	}
};

export const claimFortuneWheelPrize = async (req: CustomRequest, res: Response) => {
	const transaction = await sequelize.transaction();
	try {
		const userId = req.user?.userId;
		if (!userId) {
			await transaction.rollback();
			return res.status(401).json({ message: "Unauthorized" });
		}

		const { spin_id, fullname, email, phone_number, shipping_address = 'voucher', postal_code = 'voucher' } = req.body;
		if (!spin_id || !fullname || !email || !phone_number) {
			await transaction.rollback();
			return res.status(400).json({
				message: 'Missing required fields',
				errors: {
					spin_id: !spin_id ? 'Spin ID is required' : null,
					fullname: !fullname ? 'Full name is required' : null,
					email: !email ? 'Email is required' : null,
					phone_number: !phone_number ? 'Phone number is required' : null,
				}
			});
		}

		const user = await User.findByPk(userId, {
			transaction,
			lock: transaction.LOCK.UPDATE
		});

		if (!user) {
			await transaction.rollback();
			return res.status(404).json({ message: "User not found" });
		}

		const spin = await FortuneWheelSpin.findOne({
			where: {
				spin_id,
				user_id: userId,
				status: 'COMPLETED',
				is_redeemed: false,
				product_id: {
					[Op.ne]: null
				}
			},
			transaction,
			lock: transaction.LOCK.UPDATE
		});

		if (!spin || !spin.product_id) {
			await transaction.rollback();
			return res.status(404).json({ message: "Claimable Spin Wheel prize not found" });
		}

		const product = await Product.findByPk(spin.product_id, {
			transaction,
			lock: transaction.LOCK.UPDATE
		});

		if (!product) {
			await transaction.rollback();
			return res.status(404).json({ message: "Product not found" });
		}

		const stockAllocation = await getStockAllocationAvailability(product.product_id, 'spin_wheel', transaction);
		if (stockAllocation.allocation) {
			if ((stockAllocation.allocation.reserved_stock || 0) <= 0) {
				await transaction.rollback();
				return res.status(400).json({ message: "No reserved Spin Wheel stock found for this prize" });
			}

			stockAllocation.allocation.reserved_stock = Math.max(0, (stockAllocation.allocation.reserved_stock || 0) - 1);
			stockAllocation.allocation.used_stock = (stockAllocation.allocation.used_stock || 0) + 1;
			await stockAllocation.allocation.save({ transaction });
		}

		const redemption = await Redemption.create({
			user_id: userId,
			product_id: product.product_id,
			points_spent: 0,
			shipping_address,
			fullname,
			email,
			phone_number,
			postal_code,
			notes: 'Wheel Spin Voucher',
			status: 'active'
		}, { transaction });

		spin.is_redeemed = true;
		await spin.save({ transaction });

		await UserAction.create({
			user_id: userId,
			entity_type: 'REDEEM',
			action_type: req.method,
			redemption_id: redemption.redemption_id,
		}, { transaction });

		await transaction.commit();

		res.status(200).json({
			message: 'Spin Wheel prize claim submitted',
			redemption_id: redemption.redemption_id,
			status: 200
		});
	} catch (error: any) {
		await transaction.rollback();
		req.log.error({ error, stack: error.stack }, "Error claiming fortune wheel prize");
		res.status(500).json({ message: "Something went wrong" });
	}
};

export const getFortuneWheelList = async (req: CustomRequest, res: Response) => {
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
		req.log.error({ error, stack: error.stack }, 'Error fetching fortune wheel list');

		// Handle validation errors from Sequelize
		if (error.name === 'SequelizeValidationError') {
			const messages = error.errors.map((err: any) => err.message);
			req.log.error({ validationErrors: messages }, 'Validation error occurred');
			return res.status(400).json({ message: 'Validation error', errors: messages });
		}

		res.status(500).json({ message: 'Something went wrong', error });
	}
};

export const downloadFortuneWheelList = async (req: CustomRequest, res: Response) => {
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
		req.log.error({ error, stack: error.stack }, 'Error downloading fortune wheel list');

		// Handle validation errors from Sequelize
		if (error.name === 'SequelizeValidationError') {
			const messages = error.errors.map((err: any) => err.message);
			req.log.error({ validationErrors: messages }, 'Validation error occurred');
			return res.status(400).json({ message: 'Validation error', errors: messages });
		}

		// Handle other types of errors
		res.status(500).json({ message: 'Something went wrong', error });
	}
};