import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import logger from '../utils/logger.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store the funding strategy HTML content
const FUNDING_STRATEGY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RepSpheres Funding Strategy - Protected</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary-navy: #1a2332;
            --accent-gold: #d4af37;
            --pure-white: #ffffff;
            --light-gray: #f8f9fa;
            --success-green: #28a745;
            --border-light: #e9ecef;
            --text-secondary: #6c757d;
            --shadow-soft: 0 4px 20px rgba(26, 35, 50, 0.1);
            --shadow-medium: 0 8px 30px rgba(26, 35, 50, 0.15);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', sans-serif;
            line-height: 1.6;
            color: var(--primary-navy);
            background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
            overflow-x: hidden;
        }

        /* Navigation */
        .navbar {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-bottom: 1px solid var(--border-light);
            z-index: 1000;
            padding: 0 20px;
            height: 70px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .logo {
            font-family: 'Playfair Display', serif;
            font-size: 24px;
            font-weight: 700;
            color: var(--primary-navy);
            text-decoration: none;
        }

        .nav-right {
            display: flex;
            align-items: center;
            gap: 15px;
        }

        .protected-badge {
            background: rgba(212, 175, 55, 0.1);
            color: var(--accent-gold);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            border: 1px solid rgba(212, 175, 55, 0.3);
        }

        .logout-btn {
            padding: 8px 16px;
            background: none;
            border: 1px solid var(--accent-gold);
            color: var(--accent-gold);
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s ease;
            text-decoration: none;
        }

        .logout-btn:hover {
            background: var(--accent-gold);
            color: var(--pure-white);
        }

        .hamburger {
            width: 30px;
            height: 30px;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            gap: 4px;
            transition: all 0.3s ease;
        }

        .hamburger span {
            width: 25px;
            height: 3px;
            background: var(--accent-gold);
            transition: all 0.3s ease;
            border-radius: 2px;
        }

        .hamburger.active span:nth-child(1) {
            transform: rotate(45deg) translate(5px, 5px);
        }

        .hamburger.active span:nth-child(2) {
            opacity: 0;
        }

        .hamburger.active span:nth-child(3) {
            transform: rotate(-45deg) translate(7px, -6px);
        }

        /* Mobile Menu */
        .mobile-menu {
            position: fixed;
            top: 70px;
            left: 0;
            right: 0;
            background: var(--primary-navy);
            transform: translateY(-100%);
            opacity: 0;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 999;
            box-shadow: var(--shadow-medium);
        }

        .mobile-menu.active {
            transform: translateY(0);
            opacity: 1;
        }

        .menu-item {
            display: block;
            padding: 18px 20px;
            color: var(--pure-white);
            text-decoration: none;
            border-bottom: 1px solid rgba(212, 175, 55, 0.2);
            transition: all 0.3s ease;
            font-weight: 500;
        }

        .menu-item:hover {
            background: rgba(212, 175, 55, 0.1);
            padding-left: 30px;
        }

        /* Main Content */
        .main-content {
            margin-top: 70px;
            padding: 0;
        }

        .section {
            padding: 40px 20px;
            max-width: 1200px;
            margin: 0 auto;
        }

        .section:nth-child(even) {
            background: var(--light-gray);
        }

        .section-title {
            font-family: 'Playfair Display', serif;
            font-size: 32px;
            font-weight: 700;
            color: var(--primary-navy);
            margin-bottom: 20px;
            text-align: center;
        }

        .section-subtitle {
            font-size: 18px;
            color: var(--text-secondary);
            text-align: center;
            margin-bottom: 40px;
        }

        /* Hero Section */
        .hero {
            background: linear-gradient(135deg, var(--primary-navy) 0%, #2c3e50 100%);
            color: var(--pure-white);
            text-align: center;
            padding: 60px 20px;
        }

        .hero-title {
            font-family: 'Playfair Display', serif;
            font-size: 42px;
            font-weight: 700;
            margin-bottom: 15px;
        }

        .hero-subtitle {
            font-size: 20px;
            margin-bottom: 30px;
            opacity: 0.9;
        }

        .hero-protected-badge {
            display: inline-block;
            background: rgba(212, 175, 55, 0.2);
            color: var(--accent-gold);
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 20px;
            border: 1px solid rgba(212, 175, 55, 0.3);
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 40px;
        }

        .stat-card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(212, 175, 55, 0.3);
            border-radius: 15px;
            padding: 25px;
            text-align: center;
        }

        .stat-number {
            font-size: 28px;
            font-weight: 700;
            color: var(--accent-gold);
            display: block;
        }

        .stat-label {
            font-size: 14px;
            opacity: 0.8;
            margin-top: 5px;
        }

        /* Grant Cards */
        .grant-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 25px;
            margin-top: 30px;
        }

        .grant-card {
            background: var(--pure-white);
            border-radius: 20px;
            padding: 30px;
            box-shadow: var(--shadow-soft);
            border: 1px solid var(--border-light);
            transition: all 0.3s ease;
            cursor: pointer;
        }

        .grant-card:hover {
            transform: translateY(-5px);
            box-shadow: var(--shadow-medium);
        }

        .grant-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 20px;
        }

        .grant-title {
            font-size: 20px;
            font-weight: 600;
            color: var(--primary-navy);
            margin-bottom: 5px;
        }

        .grant-amount {
            font-size: 24px;
            font-weight: 700;
            color: var(--accent-gold);
            text-align: right;
        }

        .grant-type {
            font-size: 14px;
            color: var(--text-secondary);
            margin-bottom: 10px;
        }

        .fit-score {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 15px;
        }

        .fit-high {
            background: rgba(40, 167, 69, 0.1);
            color: var(--success-green);
        }

        .fit-medium {
            background: rgba(255, 193, 7, 0.1);
            color: #ffc107;
        }

        .grant-details {
            max-height: 0;
            overflow: hidden;
            transition: all 0.3s ease;
        }

        .grant-card.expanded .grant-details {
            max-height: 500px;
            margin-top: 20px;
        }

        .detail-item {
            margin-bottom: 15px;
        }

        .detail-label {
            font-weight: 600;
            color: var(--primary-navy);
            margin-bottom: 5px;
        }

        .detail-content {
            color: var(--text-secondary);
            font-size: 14px;
            line-height: 1.5;
        }

        /* Timeline */
        .timeline {
            position: relative;
            padding-left: 30px;
        }

        .timeline::before {
            content: '';
            position: absolute;
            left: 15px;
            top: 0;
            bottom: 0;
            width: 2px;
            background: var(--accent-gold);
        }

        .timeline-item {
            position: relative;
            margin-bottom: 30px;
            background: var(--pure-white);
            border-radius: 15px;
            padding: 20px;
            box-shadow: var(--shadow-soft);
        }

        .timeline-item::before {
            content: '';
            position: absolute;
            left: -22px;
            top: 20px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: var(--accent-gold);
        }

        .timeline-date {
            font-size: 14px;
            font-weight: 600;
            color: var(--accent-gold);
            margin-bottom: 10px;
        }

        .timeline-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--primary-navy);
            margin-bottom: 8px;
        }

        .timeline-content {
            color: var(--text-secondary);
            font-size: 14px;
        }

        /* Action Items */
        .action-list {
            list-style: none;
        }

        .action-item {
            background: var(--pure-white);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 15px;
            box-shadow: var(--shadow-soft);
            display: flex;
            align-items: flex-start;
            gap: 15px;
            cursor: pointer;
            transition: all 0.3s ease;
        }

        .action-item:hover {
            transform: translateX(5px);
        }

        .action-checkbox {
            width: 20px;
            height: 20px;
            border: 2px solid var(--accent-gold);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 2px;
        }

        .action-checkbox.checked {
            background: var(--accent-gold);
        }

        .action-content {
            flex: 1;
        }

        .action-title {
            font-weight: 600;
            color: var(--primary-navy);
            margin-bottom: 5px;
        }

        .action-description {
            color: var(--text-secondary);
            font-size: 14px;
        }

        /* Requirements Matrix */
        .requirements-table {
            width: 100%;
            border-collapse: collapse;
            background: var(--pure-white);
            border-radius: 15px;
            overflow: hidden;
            box-shadow: var(--shadow-soft);
        }

        .requirements-table th,
        .requirements-table td {
            padding: 15px;
            text-align: left;
            border-bottom: 1px solid var(--border-light);
        }

        .requirements-table th {
            background: var(--primary-navy);
            color: var(--pure-white);
            font-weight: 600;
            font-size: 14px;
        }

        .requirements-table td {
            font-size: 14px;
        }

        .requirements-table tr:hover {
            background: var(--light-gray);
        }

        /* Responsive Design */
        @media (max-width: 768px) {
            .hero-title {
                font-size: 32px;
            }

            .hero-subtitle {
                font-size: 18px;
            }

            .section-title {
                font-size: 28px;
            }

            .grant-grid {
                grid-template-columns: 1fr;
            }

            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }

            .requirements-table {
                font-size: 12px;
            }

            .requirements-table th,
            .requirements-table td {
                padding: 10px 8px;
            }

            .section {
                padding: 30px 15px;
            }

            .nav-right {
                gap: 10px;
            }
        }

        @media (max-width: 480px) {
            .hero {
                padding: 40px 15px;
            }

            .stats-grid {
                grid-template-columns: 1fr;
            }

            .stat-card {
                padding: 20px;
            }
        }

        /* Animations */
        .fade-in {
            opacity: 0;
            animation: fadeIn 0.6s ease forwards;
        }

        @keyframes fadeIn {
            to {
                opacity: 1;
            }
        }

        .slide-up {
            transform: translateY(20px);
            opacity: 0;
            animation: slideUp 0.6s ease forwards;
        }

        @keyframes slideUp {
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        /* Scroll behavior */
        html {
            scroll-behavior: smooth;
        }
    </style>
</head>
<body>
    <!-- Navigation -->
    <nav class="navbar">
        <a href="#" class="logo">RepSpheres</a>
        <div class="nav-right">
            <div class="protected-badge">🔒 Secure Access</div>
            <a href="/auth/logout" class="logout-btn">Logout</a>
            <div class="hamburger" id="hamburger">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    </nav>

    <!-- Mobile Menu -->
    <div class="mobile-menu" id="mobileMenu">
        <a href="#hero" class="menu-item">Executive Summary</a>
        <a href="#opportunities" class="menu-item">Grant Opportunities</a>
        <a href="#timeline" class="menu-item">Timeline & Deadlines</a>
        <a href="#analysis" class="menu-item">Financial Analysis</a>
        <a href="#requirements" class="menu-item">Requirements Matrix</a>
        <a href="#actions" class="menu-item">Action Items</a>
        <a href="#strategy" class="menu-item">Success Strategy</a>
    </div>

    <!-- Main Content -->
    <main class="main-content">
        <!-- Hero Section -->
        <section id="hero" class="hero">
            <div class="hero-protected-badge">🔒 Confidential Document - Authorized Access Only</div>
            <h1 class="hero-title fade-in">Grant Acquisition Strategy</h1>
            <p class="hero-subtitle slide-up">Comprehensive Funding Roadmap for RepSpheres</p>
            
            <div class="stats-grid">
                <div class="stat-card slide-up">
                    <span class="stat-number">$25M+</span>
                    <span class="stat-label">Total Addressable Funding</span>
                </div>
                <div class="stat-card slide-up">
                    <span class="stat-number">10</span>
                    <span class="stat-label">Grant Opportunities</span>
                </div>
                <div class="stat-card slide-up">
                    <span class="stat-number">$2.5M</span>
                    <span class="stat-label">Aggressive 12-Month Target</span>
                </div>
                <div class="stat-card slide-up">
                    <span class="stat-number">25:1</span>
                    <span class="stat-label">Expected ROI</span>
                </div>
            </div>
        </section>

        <!-- Grant Opportunities -->
        <section id="opportunities" class="section">
            <h2 class="section-title">Grant Opportunities</h2>
            <p class="section-subtitle">Top funding opportunities ranked by fit and probability</p>
            
            <div class="grant-grid">
                <!-- Tier 1 Grants -->
                <div class="grant-card" onclick="toggleDetails(this)">
                    <div class="grant-header">
                        <div>
                            <h3 class="grant-title">NYSTAR Innovation Matching Grants</h3>
                            <p class="grant-type">New York State • Matching Grant</p>
                            <span class="fit-score fit-high">95% Fit Score</span>
                        </div>
                        <div class="grant-amount">$200K</div>
                    </div>
                    <div class="grant-details">
                        <div class="detail-item">
                            <div class="detail-label">Requirements:</div>
                            <div class="detail-content">Active SBIR/STTR award required</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Timeline:</div>
                            <div class="detail-content">60-90 days application to decision</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Success Strategy:</div>
                            <div class="detail-content">Apply for SBIR/STTR first, then immediately apply for matching funds</div>
                        </div>
                    </div>
                </div>

                <div class="grant-card" onclick="toggleDetails(this)">
                    <div class="grant-header">
                        <div>
                            <h3 class="grant-title">NIH SBIR/STTR Program</h3>
                            <p class="grant-type">Federal • Healthcare Focus</p>
                            <span class="fit-score fit-high">90% Fit Score</span>
                        </div>
                        <div class="grant-amount">$2.1M</div>
                    </div>
                    <div class="grant-details">
                        <div class="detail-item">
                            <div class="detail-label">Next Deadline:</div>
                            <div class="detail-content">January 5, 2025</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Phase I Amount:</div>
                            <div class="detail-content">Up to $314K</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Success Strategy:</div>
                            <div class="detail-content">Focus on healthcare outcomes and AI innovation in medical aesthetics</div>
                        </div>
                    </div>
                </div>

                <div class="grant-card" onclick="toggleDetails(this)">
                    <div class="grant-header">
                        <div>
                            <h3 class="grant-title">Empire AI Consortium</h3>
                            <p class="grant-type">New York State • AI Innovation</p>
                            <span class="fit-score fit-high">85% Fit Score</span>
                        </div>
                        <div class="grant-amount">$1M+</div>
                    </div>
                    <div class="grant-details">
                        <div class="detail-item">
                            <div class="detail-label">Focus:</div>
                            <div class="detail-content">AI research and development with healthcare applications</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Partnership:</div>
                            <div class="detail-content">University partnerships encouraged</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Investment:</div>
                            <div class="detail-content">Part of $400M statewide AI investment</div>
                        </div>
                    </div>
                </div>

                <div class="grant-card" onclick="toggleDetails(this)">
                    <div class="grant-header">
                        <div>
                            <h3 class="grant-title">NSF SBIR Fast-Track</h3>
                            <p class="grant-type">Federal • Technology Innovation</p>
                            <span class="fit-score fit-high">85% Fit Score</span>
                        </div>
                        <div class="grant-amount">$2M+</div>
                    </div>
                    <div class="grant-details">
                        <div class="detail-item">
                            <div class="detail-label">Application:</div>
                            <div class="detail-content">Monthly project pitch deadlines</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Timeline:</div>
                            <div class="detail-content">4-6 months total timeline</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Focus:</div>
                            <div class="detail-content">AI/ML technology with commercial traction</div>
                        </div>
                    </div>
                </div>

                <div class="grant-card" onclick="toggleDetails(this)">
                    <div class="grant-header">
                        <div>
                            <h3 class="grant-title">Horizon Europe</h3>
                            <p class="grant-type">International • EU Partnership</p>
                            <span class="fit-score fit-medium">75% Fit Score</span>
                        </div>
                        <div class="grant-amount">€15M</div>
                    </div>
                    <div class="grant-details">
                        <div class="detail-item">
                            <div class="detail-label">Requirement:</div>
                            <div class="detail-content">EU partnership or presence required</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Investment:</div>
                            <div class="detail-content">€4B AI investment 2024-2027</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Focus:</div>
                            <div class="detail-content">Digital transformation in healthcare</div>
                        </div>
                    </div>
                </div>

                <div class="grant-card" onclick="toggleDetails(this)">
                    <div class="grant-header">
                        <div>
                            <h3 class="grant-title">GenAI4EU Initiative</h3>
                            <p class="grant-type">International • Biomedical AI</p>
                            <span class="fit-score fit-high">85% Fit Score</span>
                        </div>
                        <div class="grant-amount">€17M</div>
                    </div>
                    <div class="grant-details">
                        <div class="detail-item">
                            <div class="detail-label">Focus:</div>
                            <div class="detail-content">Generative AI in healthcare and biomedical applications</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Partnership:</div>
                            <div class="detail-content">EU partnership mandatory</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Strategy:</div>
                            <div class="detail-content">Focus on AI for personalized medicine</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Timeline -->
        <section id="timeline" class="section">
            <h2 class="section-title">Application Timeline</h2>
            <p class="section-subtitle">Strategic roadmap for the next 12 months</p>
            
            <div class="timeline">
                <div class="timeline-item">
                    <div class="timeline-date">Q4 2024 • Immediate</div>
                    <div class="timeline-title">NIH SBIR Preparation</div>
                    <div class="timeline-content">Prepare NIH SBIR application for January 5 deadline. Engage grant writing professional.</div>
                </div>
                
                <div class="timeline-item">
                    <div class="timeline-date">January 5, 2025</div>
                    <div class="timeline-title">NIH SBIR Submission</div>
                    <div class="timeline-content">Submit NIH SBIR application. Begin NYSTAR preparation materials.</div>
                </div>
                
                <div class="timeline-item">
                    <div class="timeline-date">February 2025</div>
                    <div class="timeline-title">NSF Project Pitch</div>
                    <div class="timeline-content">Submit NSF SBIR project pitch. Develop EU partnership contacts.</div>
                </div>
                
                <div class="timeline-item">
                    <div class="timeline-date">March 2025</div>
                    <div class="timeline-title">NYSTAR Application</div>
                    <div class="timeline-content">Apply for NYSTAR matching grants if NIH application advances.</div>
                </div>
                
                <div class="timeline-item">
                    <div class="timeline-date">April 5, 2025</div>
                    <div class="timeline-title">Backup Applications</div>
                    <div class="timeline-content">NIH SBIR second deadline. START-UP NY preparation.</div>
                </div>
                
                <div class="timeline-item">
                    <div class="timeline-date">Q3 2025</div>
                    <div class="timeline-title">International Opportunities</div>
                    <div class="timeline-content">EU grant applications and Phase II submissions for successful Phase I awards.</div>
                </div>
            </div>
        </section>

        <!-- Financial Analysis -->
        <section id="analysis" class="section">
            <h2 class="section-title">Financial Impact Analysis</h2>
            <p class="section-subtitle">Projected funding outcomes and investment requirements</p>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <span class="stat-number">$500K</span>
                    <span class="stat-label">Conservative 12-Month Target</span>
                </div>
                <div class="stat-card">
                    <span class="stat-number">$1.2M</span>
                    <span class="stat-label">Moderate 12-Month Target</span>
                </div>
                <div class="stat-card">
                    <span class="stat-number">$2.5M</span>
                    <span class="stat-label">Aggressive 12-Month Target</span>
                </div>
                <div class="stat-card">
                    <span class="stat-number">$100K</span>
                    <span class="stat-label">Investment in Applications</span>
                </div>
            </div>
        </section>

        <!-- Requirements Matrix -->
        <section id="requirements" class="section">
            <h2 class="section-title">Requirements Matrix</h2>
            <p class="section-subtitle">Eligibility requirements for each grant program</p>
            
            <div style="overflow-x: auto;">
                <table class="requirements-table">
                    <thead>
                        <tr>
                            <th>Grant Program</th>
                            <th>Business Stage</th>
                            <th>Location</th>
                            <th>Partnership</th>
                            <th>Special Requirements</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>NYSTAR Matching</td>
                            <td>Any</td>
                            <td>NY Required</td>
                            <td>None</td>
                            <td>SBIR/STTR Award</td>
                        </tr>
                        <tr>
                            <td>Empire AI</td>
                            <td>Early-Growth</td>
                            <td>NY Preferred</td>
                            <td>University+</td>
                            <td>AI Innovation</td>
                        </tr>
                        <tr>
                            <td>NIH SBIR</td>
                            <td>Any</td>
                            <td>US Required</td>
                            <td>None</td>
                            <td>Healthcare Focus</td>
                        </tr>
                        <tr>
                            <td>NSF SBIR</td>
                            <td>Any</td>
                            <td>US Required</td>
                            <td>None</td>
                            <td>Technology Innovation</td>
                        </tr>
                        <tr>
                            <td>Horizon Europe</td>
                            <td>Any</td>
                            <td>None</td>
                            <td>EU Partner</td>
                            <td>EU Collaboration</td>
                        </tr>
                        <tr>
                            <td>GenAI4EU</td>
                            <td>Any</td>
                            <td>None</td>
                            <td>EU Partner</td>
                            <td>AI + Healthcare</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <!-- Action Items -->
        <section id="actions" class="section">
            <h2 class="section-title">Action Items</h2>
            <p class="section-subtitle">Immediate next steps to begin grant acquisition</p>
            
            <ul class="action-list">
                <li class="action-item" onclick="toggleCheckbox(this)">
                    <div class="action-checkbox"></div>
                    <div class="action-content">
                        <div class="action-title">Engage Grant Writing Professional</div>
                        <div class="action-description">Budget $15K-$25K for NIH SBIR application assistance</div>
                    </div>
                </li>
                
                <li class="action-item" onclick="toggleCheckbox(this)">
                    <div class="action-checkbox"></div>
                    <div class="action-content">
                        <div class="action-title">Prepare Core Materials</div>
                        <div class="action-description">Updated business plan, financial projections, technical specifications</div>
                    </div>
                </li>
                
                <li class="action-item" onclick="toggleCheckbox(this)">
                    <div class="action-checkbox"></div>
                    <div class="action-content">
                        <div class="action-title">Research NIH Institutes</div>
                        <div class="action-description">Identify specific NIH institutes aligned with your platform</div>
                    </div>
                </li>
                
                <li class="action-item" onclick="toggleCheckbox(this)">
                    <div class="action-checkbox"></div>
                    <div class="action-content">
                        <div class="action-title">University Outreach</div>
                        <div class="action-description">Contact NY universities for potential partnerships</div>
                    </div>
                </li>
                
                <li class="action-item" onclick="toggleCheckbox(this)">
                    <div class="action-checkbox"></div>
                    <div class="action-content">
                        <div class="action-title">Customer Letters of Support</div>
                        <div class="action-description">Gather letters from existing customers and partners</div>
                    </div>
                </li>
                
                <li class="action-item" onclick="toggleCheckbox(this)">
                    <div class="action-checkbox"></div>
                    <div class="action-content">
                        <div class="action-title">EU Partnership Development</div>
                        <div class="action-description">Identify potential European research partners</div>
                    </div>
                </li>
            </ul>
        </section>

        <!-- Success Strategy -->
        <section id="strategy" class="section">
            <h2 class="section-title">Success Strategy</h2>
            <p class="section-subtitle">Key factors for maximizing grant acquisition success</p>
            
            <div class="grant-grid">
                <div class="grant-card">
                    <h3 class="grant-title">Professional Support</h3>
                    <p class="detail-content">Investment in experienced grant writers increases success rate 3-5x</p>
                </div>
                
                <div class="grant-card">
                    <h3 class="grant-title">Portfolio Approach</h3>
                    <p class="detail-content">Multiple applications across different agencies and deadlines</p>
                </div>
                
                <div class="grant-card">
                    <h3 class="grant-title">Early Preparation</h3>
                    <p class="detail-content">6-month lead time for major applications ensures quality submissions</p>
                </div>
                
                <div class="grant-card">
                    <h3 class="grant-title">Strategic Partnerships</h3>
                    <p class="detail-content">University and international collaborations open additional opportunities</p>
                </div>
            </div>
        </section>
    </main>

    <script>
        // Mobile menu toggle
        const hamburger = document.getElementById('hamburger');
        const mobileMenu = document.getElementById('mobileMenu');

        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            mobileMenu.classList.toggle('active');
        });

        // Close menu when clicking on menu items
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                hamburger.classList.remove('active');
                mobileMenu.classList.remove('active');
            });
        });

        // Toggle grant card details
        function toggleDetails(card) {
            card.classList.toggle('expanded');
        }

        // Toggle checkbox
        function toggleCheckbox(item) {
            const checkbox = item.querySelector('.action-checkbox');
            checkbox.classList.toggle('checked');
        }

        // Smooth scrolling for navigation links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });

        // Prevent right-click context menu (additional security measure)
        document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
        });

        // Prevent text selection (additional security measure)
        document.addEventListener('selectstart', function(e) {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
            }
        });

        // Add animation classes on scroll
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.animationDelay = '0.1s';
                    entry.target.classList.add('fade-in');
                }
            });
        }, observerOptions);

        // Observe all sections
        document.querySelectorAll('.section').forEach(section => {
            observer.observe(section);
        });
    </script>
</body>
</html>`;

// Protected route for funding strategy
router.get('/strategy', requireAuth, async (req, res) => {
  try {
    logger.info('Funding strategy accessed by user:', req.user?.id);
    
    // Add security headers
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Set content type to HTML
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    
    // Send the HTML content
    res.send(FUNDING_STRATEGY_HTML);
    
  } catch (error) {
    logger.error('Funding strategy access error:', error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Internal server error', null, 500));
  }
});

// API route to get funding strategy data (JSON format)
router.get('/strategy/data', requireAuth, async (req, res) => {
  try {
    logger.info('Funding strategy data accessed by user:', req.user?.id);
    
    const fundingData = {
      totalAddressableFunding: '$25M+',
      opportunities: 10,
      aggressiveTarget: '$2.5M',
      expectedROI: '25:1',
      grantOpportunities: [
        {
          id: 1,
          title: 'NYSTAR Innovation Matching Grants',
          type: 'New York State • Matching Grant',
          amount: '$200K',
          fitScore: 95,
          priority: 'high',
          requirements: 'Active SBIR/STTR award required',
          timeline: '60-90 days application to decision'
        },
        {
          id: 2,
          title: 'NIH SBIR/STTR Program',
          type: 'Federal • Healthcare Focus',
          amount: '$2.1M',
          fitScore: 90,
          priority: 'high',
          nextDeadline: 'January 5, 2025',
          phaseIAmount: 'Up to $314K'
        },
        {
          id: 3,
          title: 'Empire AI Consortium',
          type: 'New York State • AI Innovation',
          amount: '$1M+',
          fitScore: 85,
          priority: 'high',
          focus: 'AI research and development with healthcare applications'
        }
      ],
      timeline: [
        {
          date: 'Q4 2024 • Immediate',
          title: 'NIH SBIR Preparation',
          content: 'Prepare NIH SBIR application for January 5 deadline. Engage grant writing professional.'
        },
        {
          date: 'January 5, 2025',
          title: 'NIH SBIR Submission',
          content: 'Submit NIH SBIR application. Begin NYSTAR preparation materials.'
        }
      ],
      financialTargets: {
        conservative: '$500K',
        moderate: '$1.2M',
        aggressive: '$2.5M',
        investment: '$100K'
      }
    };
    
    res.json(successResponse(fundingData, 'Funding strategy data retrieved successfully'));
    
  } catch (error) {
    logger.error('Funding strategy data error:', error);
    res.status(500).json(errorResponse('SERVER_ERROR', 'Internal server error', null, 500));
  }
});

export default router;