import express from "express";
import { checkEligibility, updateMysteryBox } from "../controllers/mystery-box";
import authenticate from "../middleware/auth";

const router = express.Router();

router.get("/check-eligibility", authenticate, checkEligibility);
router.put("/update", authenticate, updateMysteryBox);

export default router;

