-- Add agent-specific features to procedure tables

-- Update dental_procedures table
ALTER TABLE dental_procedures 
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS agent_knowledge JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS common_objections JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS key_selling_points TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS competitive_advantages TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS sales_strategy TEXT,
ADD COLUMN IF NOT EXISTS roi_timeline TEXT,
ADD COLUMN IF NOT EXISTS target_demographics TEXT;

-- Update aesthetic_procedures table  
ALTER TABLE aesthetic_procedures 
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS agent_knowledge JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS common_objections JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS key_selling_points TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS competitive_advantages TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS sales_strategy TEXT,
ADD COLUMN IF NOT EXISTS roi_timeline TEXT,
ADD COLUMN IF NOT EXISTS target_demographics TEXT;

-- Create indexes for featured procedures
CREATE INDEX IF NOT EXISTS idx_dental_procedures_featured ON dental_procedures(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_aesthetic_procedures_featured ON aesthetic_procedures(is_featured) WHERE is_featured = true;

-- Update featured dental procedures
UPDATE dental_procedures 
SET is_featured = true,
    key_selling_points = ARRAY[
      'Robotic precision for predictable implant placement',
      'Reduced surgery time and patient discomfort',
      'Higher case acceptance with advanced technology'
    ],
    competitive_advantages = ARRAY[
      'Only robotic dental surgery system on market',
      'FDA cleared for full arch procedures',
      'Proven ROI within 18-24 months'
    ],
    sales_strategy = 'Focus on practice differentiation and attracting high-value implant cases',
    roi_timeline = '18-24 months with 2-3 cases per month',
    target_demographics = 'Tech-forward practices with 5+ implant cases/month'
WHERE name ILIKE '%YOMI%' OR name ILIKE '%robotic%';

UPDATE dental_procedures 
SET is_featured = true,
    key_selling_points = ARRAY[
      'Complete smile transformation in one day',
      'Predictable results with proven protocol',
      'Premium price point with high profit margins'
    ],
    competitive_advantages = ARRAY[
      'Established brand recognition',
      'Comprehensive training and support',
      'Marketing materials included'
    ],
    sales_strategy = 'Target practices looking to expand into full-arch solutions',
    roi_timeline = '6-12 months with 1 case per month',
    target_demographics = 'Practices with strong referral networks'
WHERE name ILIKE '%all-on-4%' OR name ILIKE '%all on 4%' OR name ILIKE '%full arch%';

UPDATE dental_procedures 
SET is_featured = true,
    key_selling_points = ARRAY[
      'Most recognized clear aligner brand',
      'Comprehensive case support',
      'Patient financing options available'
    ],
    competitive_advantages = ARRAY[
      'Brand recognition drives patient demand',
      'Proven clinical outcomes',
      'Extensive provider network'
    ],
    sales_strategy = 'Emphasize patient demand and practice growth potential',
    roi_timeline = 'Immediate with minimal investment',
    target_demographics = 'General dentists wanting to expand services'
WHERE name ILIKE '%invisalign%';

-- Update featured aesthetic procedures
UPDATE aesthetic_procedures 
SET is_featured = true,
    key_selling_points = ARRAY[
      'Non-invasive fat reduction with proven results',
      'No downtime appeals to busy patients',
      'High patient satisfaction rates'
    ],
    competitive_advantages = ARRAY[
      '#1 non-invasive fat reduction brand',
      'Elite system with improved comfort',
      'Extensive clinical studies'
    ],
    sales_strategy = 'Position as gateway to body contouring services',
    roi_timeline = '12-18 months with proper marketing',
    target_demographics = 'Practices targeting body-conscious patients 30-60'
WHERE name ILIKE '%coolsculpt%';

UPDATE aesthetic_procedures 
SET is_featured = true,
    key_selling_points = ARRAY[
      'Most popular aesthetic treatment globally',
      'Quick treatment with immediate results',
      'High profit margins with repeat patients'
    ],
    competitive_advantages = ARRAY[
      'Gold standard neurotoxin',
      'Extensive safety profile',
      'Strong patient awareness'
    ],
    sales_strategy = 'Gateway treatment for aesthetic practices',
    roi_timeline = 'Immediate profitability',
    target_demographics = 'Patients 25-65 seeking preventative and corrective treatment'
WHERE name ILIKE '%botox%' OR name ILIKE '%dysport%';

UPDATE aesthetic_procedures 
SET is_featured = true,
    key_selling_points = ARRAY[
      'Immediate volumizing results',
      'Long-lasting effects up to 2 years',
      'Comprehensive product portfolio'
    ],
    competitive_advantages = ARRAY[
      'Vycross technology for smooth results',
      'Full face treatment options',
      'Allergan brand trust'
    ],
    sales_strategy = 'Complement neurotoxin services for full-face rejuvenation',
    roi_timeline = 'Immediate with high margins',
    target_demographics = 'Patients 35+ seeking facial volume restoration'
WHERE name ILIKE '%juvederm%' OR name ILIKE '%restylane%' OR category = 'Dermal Fillers';

UPDATE aesthetic_procedures 
SET is_featured = true,
    key_selling_points = ARRAY[
      'Simultaneous fat reduction and muscle building',
      'FDA cleared for multiple body areas',
      'No downtime with visible results'
    ],
    competitive_advantages = ARRAY[
      'Only device that builds muscle while burning fat',
      'HIFEM + RF technology',
      'Clinical studies show 30% fat reduction'
    ],
    sales_strategy = 'Premium body contouring for athletic demographic',
    roi_timeline = '18-24 months with strong marketing',
    target_demographics = 'Fit patients wanting to enhance results'
WHERE name ILIKE '%emsculpt%';

-- Set more featured procedures
UPDATE dental_procedures SET is_featured = true 
WHERE name ILIKE '%nobel biocare%' 
   OR name ILIKE '%straumann%'
   OR name ILIKE '%digital denture%'
   OR name ILIKE '%CEREC%'
   OR name ILIKE '%guided surgery%';

UPDATE aesthetic_procedures SET is_featured = true 
WHERE name ILIKE '%morpheus%'
   OR name ILIKE '%ultherapy%'
   OR name ILIKE '%hydrafacial%'
   OR name ILIKE '%CO2 laser%'
   OR name ILIKE '%IPL%'
   OR name ILIKE '%BBL%'
   OR name ILIKE '%sculptra%'
   OR (name ILIKE '%thread%' AND name ILIKE '%lift%');