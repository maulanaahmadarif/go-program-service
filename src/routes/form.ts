import express from "express";

// import authenticate from '../middleware/auth';
import {
	createFormType,
	formSubmission,
	getFormByProject,
	deleteForm,
	getFormSubmission,
	downloadSubmission,
	approveSubmission,
	getReport,
	getFormSubmissionByUserId,
	getFormTypeUsers,
} from "../controllers/form";
import authenticate from "../middleware/auth";
import checkDomain from "../middleware/domain";

const router = express.Router();

router.post("/create-form-type", createFormType);
router.post("/submit", authenticate, checkDomain, formSubmission);
router.get("/project", authenticate, getFormByProject);
router.delete("/delete/:form_id", authenticate, deleteForm);
router.get("/submission", authenticate, getFormSubmission);
router.get("/submission/user", authenticate, getFormSubmissionByUserId);
router.get("/submission/type-users", authenticate, getFormTypeUsers);
router.post("/approve/:form_id", authenticate, approveSubmission);
router.get("/submission/download", authenticate, downloadSubmission);
router.get("/submission/report", getReport);

export default router;
