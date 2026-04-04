import React from 'react';
import { motion } from 'framer-motion';
import { Train, Clock, ShieldCheck, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '../styles/LandingPage.css';


const featureReveal = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.12
    }
  }
};

const featureItem = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }
};

const MotionDiv = motion.div;
const MotionButton = motion.button;

function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="landing-container">
      <main className="landing-main container">
        <section className="hero-layout">
          <MotionDiv
            className="hero-section flex-col items-start text-left"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="hero-badge badge badge-info">Introducing Delayed Passenger System</div>
            <h1 className="hero-title">
              Missed Your Train? <br />
              <span className="text-accent">"Catch It Later"</span>
            </h1>
            <p className="hero-subtitle">
              Don&apos;t worry about being marked "No Show". Safar Sathi helps you find the next catchable station and securely notifies the TTE.
            </p>

            <div className="hero-actions flex gap-4 mt-6">
              <MotionButton
                className="btn btn-primary hero-cta group interactive-lift"
                onClick={() => navigate('/missed-train')}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                Train Recovery
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform inline-block ml-2" />
              </MotionButton>
              <MotionButton
                className="btn btn-outline hero-cta group bg-white border-primary text-primary interactive-lift"
                onClick={() => navigate('/missed-train')}
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
              >
                Live Train Search
                <Train size={20} className="inline-block ml-2 group-hover:scale-110 transition-transform" />
              </MotionButton>
            </div>
          </MotionDiv>
        </section>

        <MotionDiv
          className="features-grid"
          variants={featureReveal}
          initial="hidden"
          animate="visible"
        >
          <MotionDiv className="feature-card card" variants={featureItem} whileHover={{ y: -6 }}>
            <div className="feature-icon bg-primary-light text-primary">
              <Clock size={32} />
            </div>
            <div className="feature-content">
              <h3>Smart Prediction</h3>
              <p className="text-secondary">We analyze train routes, delays, and current location to suggest the best catchable station.</p>
            </div>
          </MotionDiv>
          <MotionDiv className="feature-card card" variants={featureItem} whileHover={{ y: -6 }}>
            <div className="feature-icon bg-accent-light text-accent">
              <Train size={32} />
            </div>
            <div className="feature-content">
              <h3>Connecting Trains</h3>
              <p className="text-secondary">Find alternative trains to help you reach the catchable station before your original train leaves.</p>
            </div>
          </MotionDiv>
          <MotionDiv className="feature-card card" variants={featureItem} whileHover={{ y: -6 }}>
            <div className="feature-icon bg-success-light text-success">
              <ShieldCheck size={32} />
            </div>
            <div className="feature-content">
              <h3>TTE Protection</h3>
              <p className="text-secondary">Generate an official QR Pass. The TTE is notified instantly, protecting your reservation from "No Show" cancellation.</p>
            </div>
          </MotionDiv>
        </MotionDiv>
      </main>
    </div>
  );
}

export default LandingPage;
