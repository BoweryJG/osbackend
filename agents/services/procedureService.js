import { createClient } from '@supabase/supabase-js';

export class ProcedureService {
  constructor() {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      );
    } else {
      this.supabase = null;
    }
  }

  async getFeaturedProcedures() {
    if (!this.supabase) {
      throw new Error('Database connection not available');
    }

    try {
      // Get featured dental procedures
      const { data: dentalProcedures, error: dentalError } = await this.supabase
        .from('dental_procedures')
        .select('*')
        .eq('is_featured', true)
        .order('name');

      if (dentalError) throw dentalError;

      // Get featured aesthetic procedures
      const { data: aestheticProcedures, error: aestheticError } = await this.supabase
        .from('aesthetic_procedures')
        .select('*')
        .eq('is_featured', true)
        .order('name');

      if (aestheticError) throw aestheticError;

      return {
        dental: dentalProcedures || [],
        aesthetic: aestheticProcedures || []
      };
    } catch (error) {
      console.error('Error fetching featured procedures:', error);
      throw error;
    }
  }

  async getProcedure(procedureId, procedureType) {
    if (!this.supabase) {
      throw new Error('Database connection not available');
    }

    const table = procedureType === 'dental' ? 'dental_procedures' : 'aesthetic_procedures';
    
    const { data, error } = await this.supabase
      .from(table)
      .select('*')
      .eq('id', procedureId)
      .single();

    if (error) {
      throw new Error(`Failed to fetch procedure: ${error.message}`);
    }

    return data;
  }

  async searchProcedures(searchTerm, procedureType = null) {
    if (!this.supabase) {
      throw new Error('Database connection not available');
    }

    const results = [];

    // Search dental procedures if type is null or dental
    if (!procedureType || procedureType === 'dental') {
      const { data: dentalResults } = await this.supabase
        .from('dental_procedures')
        .select('*')
        .or(`name.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%,subcategory.ilike.%${searchTerm}%`)
        .limit(10);

      if (dentalResults) {
        results.push(...dentalResults.map(p => ({ ...p, type: 'dental' })));
      }
    }

    // Search aesthetic procedures if type is null or aesthetic
    if (!procedureType || procedureType === 'aesthetic') {
      const { data: aestheticResults } = await this.supabase
        .from('aesthetic_procedures')
        .select('*')
        .or(`name.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%,subcategory.ilike.%${searchTerm}%`)
        .limit(10);

      if (aestheticResults) {
        results.push(...aestheticResults.map(p => ({ ...p, type: 'aesthetic' })));
      }
    }

    return results;
  }

  generateProcedureContext(procedure) {
    return {
      name: procedure.name,
      category: procedure.category,
      subcategory: procedure.subcategory,
      manufacturer: procedure.manufacturer,
      price_range: procedure.price_range || 'Contact for pricing',
      treatment_duration: procedure.treatment_duration,
      key_features: procedure.key_selling_points || [],
      competitive_advantages: procedure.competitive_advantages || [],
      common_objections: procedure.common_objections || [],
      sales_strategy: procedure.sales_strategy || '',
      roi_timeline: procedure.roi_timeline || '',
      target_demographics: procedure.target_demographics || '',
      related_procedures: procedure.related_procedures || [],
      keywords: procedure.keywords || []
    };
  }

  enhanceAgentPrompt(basePrompt, procedure) {
    const context = this.generateProcedureContext(procedure);
    
    return `${basePrompt}

## Procedure Specialization: ${context.name}

You are now a specialized expert in ${context.name} (${context.category} - ${context.subcategory}).

### Product Knowledge
- **Manufacturer**: ${context.manufacturer || 'Various'}
- **Price Range**: ${context.price_range}
- **Treatment Duration**: ${context.treatment_duration || 'Varies'}
- **Target Demographics**: ${context.target_demographics}

### Key Selling Points
${context.key_features.map(point => `- ${point}`).join('\n')}

### Competitive Advantages
${context.competitive_advantages.map(adv => `- ${adv}`).join('\n')}

### Common Objections & How to Address Them
${context.common_objections.map(obj => 
  `- **Objection**: ${obj.objection || obj}\n  **Response**: ${obj.response || 'Address with value proposition'}`
).join('\n\n')}

### Sales Strategy
${context.sales_strategy}

### ROI Timeline
${context.roi_timeline}

### Related Keywords for Research
${context.keywords.join(', ')}

Use this specialized knowledge to provide expert guidance on selling ${context.name}. Always relate conversations back to these specific benefits and advantages.`;
  }

  async getTopProceduresByRevenue(limit = 10) {
    if (!this.supabase) {
      throw new Error('Database connection not available');
    }

    // This would ideally sort by actual revenue data if available
    const { data: procedures } = await this.supabase
      .from('dental_procedures')
      .select('*')
      .eq('is_featured', true)
      .limit(limit / 2);

    const { data: aestheticProcs } = await this.supabase
      .from('aesthetic_procedures')
      .select('*')
      .eq('is_featured', true)
      .limit(limit / 2);

    return [...(procedures || []), ...(aestheticProcs || [])];
  }
}