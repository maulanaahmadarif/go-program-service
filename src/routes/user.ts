import express from "express";

// import authenticate from '../middleware/auth';
import {
  userLogin,
  userSignup,
  getUserProfile,
  getUserList,
  forgotPassword,
  resetPassword,
  updateUser,
  userSignupConfirmation,
  addInternalUser,
  deleteUser,
  activateUser,
  bulkGenerateReferralCodes,
  downloadUserList,
  getReferredUsers,
  getReferralCodeUsers,
  getCurrentUserReferrals,
  getUsersWhoUsedReferral,
  getUsersWithUsedReferralCodes,
} from "../controllers/user";
import authenticate from "../middleware/auth";
import checkEmailDomain from "../middleware/emailDomain";

const router = express.Router();

router.post("/login", userLogin);
router.post("/signup", userSignup);
// router.post('/add-internal-user', addInternalUser)
router.get("/profile", authenticate, getUserProfile);
router.get("/list", getUserList);
router.get("/referred", authenticate, getReferredUsers);
router.get("/referral-codes", authenticate, getReferralCodeUsers);
router.get("/my-referrals", authenticate, getCurrentUserReferrals);
router.get("/referrals/used", authenticate, getUsersWhoUsedReferral);
router.get("/referrals/referrers", authenticate, getUsersWithUsedReferralCodes);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/update", authenticate, updateUser);
router.get("/confirmation/:token", userSignupConfirmation);
router.delete("/delete/:user_id", authenticate, deleteUser);
router.post("/activate", authenticate, activateUser);
// router.post('/bulk-generate-referral-codes', bulkGenerateReferralCodes)
router.get("/download", downloadUserList);

export default router;
