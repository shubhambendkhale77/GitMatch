import Comparison from "../models/Comparison.model.js";
import StandardProfile from "../models/StandardProfile.model.js";
import GitHubMetrics from "../models/GitHubMetrics.model.js";
import githubService from "../services/github.service.js";

// Compare function
const compareToStandard = (metrics, standardProfile) => {
  const result = {
    overall_score: 0,
    metrics_breakdown: {},
    strengths: [],
    weaknesses: [],
  };

  let totalWeight = 0;
  let weightedScore = 0;

  // Commit frequency
  if (standardProfile.metrics.commit_frequency) {
    const weight = standardProfile.weights.commit_frequency || 1;
    totalWeight += weight;

    const score = Math.min(
      100,
      (metrics.commit_frequency /
        standardProfile.metrics.commit_frequency.optimal) *
        100
    );

    weightedScore += score * weight;

    result.metrics_breakdown.commit_frequency = {
      score,
      weight,
      description: `${metrics.commit_frequency.toFixed(
        1
      )} commits per repo (optimal: ${
        standardProfile.metrics.commit_frequency.optimal
      })`,
    };

    if (score >= 80) {
      result.strengths.push("Consistent commit activity");
    } else if (score < 50) {
      result.weaknesses.push("Low commit frequency");
    }
  }

  // Repository count
  if (standardProfile.metrics.repository_count) {
    const weight = standardProfile.weights.repository_count || 1;
    totalWeight += weight;

    const score = Math.min(
      100,
      (metrics.repository_count /
        standardProfile.metrics.repository_count.min) *
        100
    );

    weightedScore += score * weight;

    result.metrics_breakdown.repository_count = {
      score,
      weight,
      description: `${metrics.repository_count} repositories (min: ${standardProfile.metrics.repository_count.min})`,
    };

    if (score >= 80) {
      result.strengths.push("Good portfolio of projects");
    } else if (score < 50) {
      result.weaknesses.push("Limited number of public repositories");
    }
  }

  // Stars received
  if (standardProfile.metrics.stars_received) {
    const weight = standardProfile.weights.stars_received || 1;
    totalWeight += weight;

    const score = Math.min(
      100,
      (metrics.stars_received / standardProfile.metrics.stars_received.min) *
        100
    );

    weightedScore += score * weight;

    result.metrics_breakdown.stars_received = {
      score,
      weight,
      description: `${metrics.stars_received} stars received (min: ${standardProfile.metrics.stars_received.min})`,
    };

    if (score >= 80) {
      result.strengths.push("Projects have good community recognition");
    } else if (score < 50) {
      result.weaknesses.push("Limited project popularity");
    }
  }

  // Language requirements
  if (
    standardProfile.metrics.language_requirements &&
    standardProfile.metrics.language_requirements.length > 0
  ) {
    const weight = standardProfile.weights.language_match || 1;
    totalWeight += weight;

    let matchScore = 0;
    let languages = [];

    standardProfile.metrics.language_requirements.forEach((req) => {
      const langBytes = metrics.language_breakdown[req.language] || 0;
      const totalBytes = Object.values(metrics.language_breakdown).reduce(
        (sum, val) => sum + val,
        0
      );

      const percentage = totalBytes > 0 ? (langBytes / totalBytes) * 100 : 0;
      const match = Math.min(100, (percentage / req.proficiency) * 100);

      matchScore += match * (req.proficiency / 100);

      languages.push(
        `${req.language}: ${percentage.toFixed(1)}% (required: ${
          req.proficiency
        }%)`
      );
    });

    const score = matchScore;
    weightedScore += score * weight;

    result.metrics_breakdown.language_match = {
      score,
      weight,
      description: `Language match: ${languages.join(", ")}`,
    };

    if (score >= 80) {
      result.strengths.push("Strong match with required programming languages");
    } else if (score < 50) {
      result.weaknesses.push(
        "Limited experience with required programming languages"
      );
    }
  }

  // Code quality
  if (standardProfile.metrics.code_quality_estimate) {
    const weight = standardProfile.weights.code_quality_estimate || 1;
    totalWeight += weight;

    const score = Math.min(
      100,
      (metrics.code_quality_estimate /
        standardProfile.metrics.code_quality_estimate.min) *
        100
    );

    weightedScore += score * weight;

    result.metrics_breakdown.code_quality_estimate = {
      score,
      weight,
      description: `Quality score: ${metrics.code_quality_estimate.toFixed(
        1
      )} (min: ${standardProfile.metrics.code_quality_estimate.min})`,
    };

    if (score >= 80) {
      result.strengths.push("High quality codebase");
    } else if (score < 50) {
      result.weaknesses.push("Improvements needed in code quality");
    }
  }

  // Calculate overall score
  result.overall_score = totalWeight > 0 ? weightedScore / totalWeight : 0;

  // Determine recommendation
  if (result.overall_score >= 75) {
    result.recommendation = "Hire";
  } else if (result.overall_score >= 50) {
    result.recommendation = "Consider";
  } else {
    result.recommendation = "No Hire";
  }

  return result;
};

// Create new comparison
// Update the createComparison function in your comparison controller
export const createComparison = async (req, res) => {
  try {
    const { candidate_username, standard_profile_id, user_id } = req.body;

    // 1. Get GitHub metrics for the candidate
    const githubAnalytics = await githubService.getGitHubProfileAnalytics(
      candidate_username
    );

    // 2. Get the standard profile for comparison
    const standardProfile = await StandardProfile.findById(standard_profile_id);

    if (!standardProfile) {
      return res.status(404).json({ message: "Standard profile not found" });
    }

    // 3. Convert GitHub analytics to metrics format
    const metrics = {
      commit_frequency:
        githubAnalytics.commitActivity.averageCommitsPerDay || 0,
      repository_count: githubAnalytics.repoStats.totalRepos || 0,
      stars_received: githubAnalytics.repoStats.starsReceived || 0,
      language_breakdown: githubAnalytics.languageBreakdown.reduce(
        (obj, lang) => {
          obj[lang.name] = lang.value;
          return obj;
        },
        {}
      ),
      code_quality_estimate: 75.0, // Using a default value since this is hard to calculate
    };

    // 4. Use the compareToStandard function to generate the comparison result
    const comparisonResult = compareToStandard(metrics, standardProfile);

    // 5. Create and save the comparison
    const newComparison = new Comparison({
      candidate_username,
      standard_profile: standard_profile_id,
      user_id,
      result: comparisonResult,
    });
    const savedComparison = await newComparison.save();

    // 6. Return the saved comparison with its ID
    res.status(201).json(savedComparison);
  } catch (error) {
    console.error("Error creating comparison:", error);
    res
      .status(500)
      .json({ message: "Error creating comparison", error: error.message });
  }
};
// Get all comparisons
export const getComparisons = async (req, res) => {
  try {
    const comparisons = await Comparison.find({
      user_id: req.query.user_id,
    })
      .populate("standard_profile", "name description")
      .sort({ created_at: -1 });

    res.json(comparisons);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get single comparison
export const getComparison = async (req, res) => {
  try {
    const comparison = await Comparison.findById(req.params.id).populate(
      "standard_profile"
    );

    if (!comparison) {
      return res
        .status(404)
        .json({ success: false, error: "Comparison not found" });
    }

    // Get GitHub profile data for the candidate
    const candidateProfile = await githubService.getUserProfile(
      comparison.candidate_username
    );

    // Get language breakdown for the candidate
    const repos = await githubService.getUserRepositories(
      comparison.candidate_username
    );
    const languageBreakdown = await githubService.getLanguageBreakdown(repos);

    // Create a response with both the comparison and candidate data
    const responseData = {
      ...comparison._doc,
      candidate: {
        name: candidateProfile.name || candidateProfile.login,
        username: candidateProfile.login,
        avatar_url: candidateProfile.avatar_url,
        bio: candidateProfile.bio || "",
        public_repos: candidateProfile.public_repos,
        followers: candidateProfile.followers,
      },
      result: {
        ...comparison.result,
        language_breakdown: languageBreakdown.slice(0, 5), // Include top 5 languages
      },
    };

    res.json(responseData);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete comparison
export const deleteComparison = async (req, res) => {
  try {
    const comparison = await Comparison.findByIdAndDelete(req.params.id);

    if (!comparison) {
      return res
        .status(404)
        .json({ success: false, error: "Comparison not found" });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
