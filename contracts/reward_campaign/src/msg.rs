use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Uint128;

#[cw_serde]
pub struct InstantiateMsg {}

#[cw_serde]
pub enum ExecuteMsg {
    CreateCampaign {
        title: String,
        description: String,
        target_platform: String,
        duration_days: u64,
        max_participants: u32,
        /// Optional operator address allowed to call DistributeRewards on behalf of creator.
        /// Set to the agent wallet address to enable autonomous reward distribution.
        operator: Option<String>,
    },
    JoinCampaign {
        campaign_id: u64,
    },
    SubmitContent {
        campaign_id: u64,
        content_hash: String,
        post_url: String,
    },
    /// Join and submit in a single transaction — the preferred flow.
    /// Idempotent for wallets that already joined via JoinCampaign.
    JoinAndSubmit {
        campaign_id: u64,
        content_hash: String,
        post_url: String,
    },
    DistributeRewards {
        campaign_id: u64,
    },
    ClaimReward {
        campaign_id: u64,
    },
    CancelCampaign {
        campaign_id: u64,
    },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(CampaignResponse)]
    GetCampaign { campaign_id: u64 },

    #[returns(CampaignsResponse)]
    ListCampaigns {
        start_after: Option<u64>,
        limit: Option<u32>,
    },

    #[returns(ParticipantsResponse)]
    GetParticipants { campaign_id: u64 },

    #[returns(RewardResponse)]
    GetReward { campaign_id: u64, participant: String },

    #[returns(StatsResponse)]
    GetStats {},
}

#[cw_serde]
pub struct CampaignResponse {
    pub id: u64,
    pub creator: String,
    pub operator: Option<String>,
    pub title: String,
    pub description: String,
    pub target_platform: String,
    pub reward_pool: Uint128,
    pub duration_days: u64,
    pub max_participants: u32,
    pub participant_count: u32,
    pub status: String,
    pub created_at: u64,
    pub ends_at: u64,
    pub distributed: bool,
}

#[cw_serde]
pub struct CampaignsResponse {
    pub campaigns: Vec<CampaignResponse>,
}

#[cw_serde]
pub struct ParticipantInfo {
    pub address: String,
    pub content_hash: Option<String>,
    pub post_url: Option<String>,
    pub joined_at: u64,
    pub reward_claimed: bool,
    pub reward_amount: Uint128,
}

#[cw_serde]
pub struct ParticipantsResponse {
    pub participants: Vec<ParticipantInfo>,
}

#[cw_serde]
pub struct RewardResponse {
    pub amount: Uint128,
    pub claimed: bool,
}

#[cw_serde]
pub struct StatsResponse {
    pub total_campaigns: u64,
    pub total_participants: u64,
    pub total_rewards_distributed: Uint128,
}
